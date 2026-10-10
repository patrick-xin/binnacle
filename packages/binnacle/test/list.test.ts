import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { createModel, list } from '../src/index.ts'
import type { Layout, ListItem, ListRow } from '../src/index.ts'
import { mount } from './support/mount.ts'

const UP = '\x1b[A'
const DOWN = '\x1b[B'
const PAGE_UP = '\x1b[5~'
const PAGE_DOWN = '\x1b[6~'
const ENTER = '\r'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const items = (...labels: string[]): ListItem[] => labels.map((label) => ({ label }))

async function fruit(
  options: { columns?: number; rows?: number; layout?: Layout } = {},
  more: { key?: () => unknown; toggle?: (index: number) => void } = {},
) {
  const mounted = await mount({ columns: options.columns ?? 20, rows: options.rows ?? 4 })
  mounted.ready()
  const shown = createModel({ items: items('fig', 'pear', 'plum') })
  const picked: number[] = []
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.show({ name: 'pick', focus: 'fruit', layout: options.layout ?? { place: 'fruit' } })
      list(ctx.binnacle, {
        name: 'fruit',
        items: () => shown.state.items,
        pick: (index) => picked.push(index),
        models: [shown],
        ...more,
      })
    },
  })
  const rows = async () => (await mounted.terminal.read()).rows.map((row) => row.trimEnd()).filter((row) => row !== '')
  const press = async (...keys: string[]) => {
    await mounted.terminal.read()
    for (const key of keys) {
      mounted.terminal.type(key)
      await settled()
    }
  }
  return { ...mounted, shown, picked, rows, press }
}

test('up and down move a List’s mark and wrap, and enter picks the marked item', async () => {
  const { rows, press, picked } = await fruit()
  const seen = [await rows()]
  await press(UP)
  seen.push(await rows())
  await press(DOWN, DOWN)
  seen.push(await rows())
  await press(ENTER)
  assert.deepEqual(
    [seen, picked],
    [
      [
        ['› fig', '  pear', '  plum'],
        ['  fig', '  pear', '› plum'],
        ['  fig', '› pear', '  plum'],
      ],
      [1],
    ],
  )
})

test('a click on an item of a List marks it and picks it, and a click below the items does nothing', async () => {
  const { rows, terminal, picked } = await fruit()
  await rows()
  terminal.type(clickAt(3, 2))
  await settled()
  const marked = await rows()
  terminal.type(clickAt(3, 3))
  await settled()
  assert.deepEqual([marked, picked], [['  fig', '  pear', '› plum'], [2]])
})

test('a List’s mark goes back to the first item when its key changes', async () => {
  const key = { now: 'a' }
  const { rows, press, shown } = await fruit({}, { key: () => key.now })
  await press(DOWN, DOWN)
  const before = await rows()
  key.now = 'b'
  shown.set((state) => (state.items = items('oak', 'elm', 'ash')))
  await settled()
  assert.deepEqual(
    [before, await rows()],
    [
      ['  fig', '  pear', '› plum'],
      ['› oak', '  elm', '  ash'],
    ],
  )
})

test('a List’s item with `checked` draws a box, and its toggle action has no keys until someone binds it', async () => {
  const toggled: number[] = []
  const { rows, press, shown, ctx } = await fruit({}, { toggle: (index) => toggled.push(index) })
  shown.set((state) => (state.items = [{ label: 'fig', checked: true }, { label: 'pear', checked: false }, { label: 'plum' }]))
  await settled()
  await press(' ')
  const unbound = { keys: ctx.binnacle.keysOf('fruit.toggle'), toggled: [...toggled] }
  await ctx.plugin({
    name: 'binder',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.bind('list.toggle', ['space'])
    },
  })
  await press(DOWN, ' ')
  assert.deepEqual([await rows(), unbound, toggled], [['  [x] fig', '› [ ] pear', '  plum'], { keys: [], toggled: [] }, [1]])
})

test('page up and page down move a List’s mark by as many items as its Place shows, an item that wraps counted once, and stop at the first and the last', async () => {
  const { rows, press, shown } = await fruit({ columns: 10, rows: 3, layout: { place: 'fruit', size: { fixed: 3 } } })
  shown.set((state) => (state.items = items('a', 'b long long', 'c', 'd', 'e', 'f')))
  await settled()
  const seen = [await rows()]
  await press(PAGE_DOWN)
  seen.push(await rows())
  await press(PAGE_DOWN, PAGE_DOWN, PAGE_DOWN)
  seen.push(await rows())
  await press(PAGE_UP)
  seen.push(await rows())
  await press(PAGE_UP, PAGE_UP, PAGE_UP)
  seen.push(await rows())
  assert.deepEqual(seen, [
    ['› a', '  b long', 'long'],
    ['  b long', 'long', '› c'],
    ['  d', '  e', '› f'],
    ['› c', '  d', '  e'],
    ['› a', '  b long', 'long'],
  ])
})

test('a List’s view moves only as far as its mark needs: a mark within the rows shown moves no row, and a mark past an edge brings the view on until it is at that edge', async () => {
  const { rows, press, shown } = await fruit({ rows: 3, layout: { place: 'fruit', size: { fixed: 3 } } })
  shown.set((state) => (state.items = items('a', 'b', 'c', 'd', 'e', 'f')))
  await settled()
  const seen = [await rows()]
  await press(DOWN)
  seen.push(await rows())
  await press(DOWN, DOWN)
  seen.push(await rows())
  await press(UP)
  seen.push(await rows())
  await press(UP, UP)
  seen.push(await rows())
  assert.deepEqual(seen, [
    ['› a', '  b', '  c'],
    ['  a', '› b', '  c'],
    ['  b', '  c', '› d'],
    ['  b', '› c', '  d'],
    ['› a', '  b', '  c'],
  ])
})

test('a page of a List is at least one item, as when its page action runs while its Place is not drawn', async () => {
  const { ctx } = await fruit({ layout: { place: 'other' } })
  ctx.binnacle.run('fruit.pageDown')
  assert.equal(ctx.binnacle.modelOf<{ mark: number }>('fruit').state?.mark, 1)
})

test('when a List’s items shrink and its key is the same, the mark stays on the last item', async () => {
  const { rows, press, shown } = await fruit()
  await press(DOWN, DOWN)
  shown.set((state) => (state.items = items('fig', 'pear')))
  await settled()
  const shrunk = await rows()
  shown.set((state) => (state.items = items('fig', 'pear', 'plum')))
  await settled()
  assert.deepEqual(
    [shrunk, await rows()],
    [
      ['  fig', '› pear'],
      ['  fig', '› pear', '  plum'],
    ],
  )
})

test('a List with no items has no mark, and enter and the page keys do nothing', async () => {
  const { rows, press, shown, picked, ctx } = await fruit()
  const model = ctx.binnacle.modelOf<{ mark: number }>('fruit')
  shown.set((state) => (state.items = []))
  await settled()
  await press(PAGE_DOWN, PAGE_UP, ENTER, DOWN)
  const empty = await rows()
  shown.set((state) => (state.items = items('fig', 'pear')))
  await settled()
  assert.deepEqual([empty, picked, model.state?.mark, await rows()], [[], [], 0, ['› fig', '  pear']])
})

test('a List’s rows are drawn with the theme’s tokens and the Looks of its kind and of its instance', async () => {
  const { rows, ctx, terminal } = await fruit()
  await ctx.plugin({
    name: 'looks',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ glyphs: { mark: '>' }, colors: { accent: 'magenta' } })
      plugin.binnacle.look<ListRow>('list.row', (beneath) => (item, at) => `${beneath(item, at)}!`)
      plugin.binnacle.look<ListRow>('fruit.row', (beneath) => (item, at) => (at.index === 2 ? `${item.label}?` : beneath(item, at)))
    },
  })
  assert.deepEqual([await rows(), await terminal.colourAt(0, 0)], [['> fig!', '  pear!', 'plum?'], 5])
})

test('a List’s box draws its frame in the theme’s border Tone, and a checked box’s mark in success', async () => {
  const { rows, shown, ctx, terminal } = await fruit()
  shown.set(
    (state) =>
      (state.items = [
        { label: 'fig', checked: true },
        { label: 'pear', checked: false },
      ]),
  )
  await settled()
  await rows()
  const cells = async () => ({
    checked: [await terminal.styleAt(2, 0), await terminal.styleAt(3, 0), await terminal.styleAt(4, 0)].map(({ colour, dim }) => ({
      colour,
      dim,
    })),
    unchecked: [await terminal.styleAt(2, 1), await terminal.styleAt(4, 1)].map(({ colour, dim }) => ({ colour, dim })),
  })
  const before = await cells()
  await ctx.plugin({
    name: 'theme',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ colors: { border: 'red', success: 'blue' } })
    },
  })
  const dim = { colour: 'default', dim: true }
  const red = { colour: 1, dim: false }
  assert.deepEqual(
    [before, await cells()],
    [
      { checked: [dim, { colour: 2, dim: false }, dim], unchecked: [dim, dim] },
      { checked: [red, { colour: 4, dim: false }, red], unchecked: [red, red] },
    ],
  )
})
