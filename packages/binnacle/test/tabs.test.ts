import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { createModel, line, tabs } from '../src/index.ts'
import type { TabLook } from '../src/index.ts'
import { mount } from './support/mount.ts'

const TAB = '\t'
const SHIFT_TAB = '\x1b[Z'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function paged(labels: string[], options: { columns?: number; current?: number } = {}) {
  const mounted = await mount({ columns: options.columns ?? 30, rows: 3 })
  mounted.ready()
  const pages = createModel({ labels, current: options.current ?? 0 })
  const went: number[] = []
  await mounted.ctx.plugin({
    name: 'feature',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      ctx.binnacle.show({
        name: 'ask',
        focus: 'answer',
        layout: { column: [{ place: 'pages', size: 'content' }, { place: 'answer', size: 'content' }, { place: 'below' }] },
      })
      ctx.binnacle.place('below', { lines: () => ['below'] })
      line(ctx.binnacle, { name: 'answer', shown: () => true, submit: () => {}, escape: () => {} })
      tabs(ctx.binnacle, {
        name: 'pages',
        labels: () => pages.state.labels,
        current: () => pages.state.current,
        go: (index) => {
          went.push(index)
          pages.set((state) => (state.current = index))
        },
        keysIn: ['answer'],
        models: [pages],
      })
    },
  })
  const rows = async () => (await mounted.terminal.read()).rows.map((row) => row.trimEnd())
  const press = async (...keys: string[]) => {
    await mounted.terminal.read()
    for (const key of keys) {
      mounted.terminal.type(key)
      await settled()
    }
  }
  return { ...mounted, pages, went, rows, press }
}

test('Tabs draw while there is more than one label, and a click on a tab goes to it and leaves the Focus where it was', async () => {
  const { rows, press, pages, went } = await paged(['one'])
  const one = await rows()
  pages.set((state) => (state.labels = ['one', 'two', 'three']))
  await settled()
  const three = await rows()
  await press(clickAt(17, 0), 'x')
  assert.deepEqual(
    [one, three, await rows(), went],
    [['›', 'below', ''], ['› one |   two |   three', '›', 'below'], ['  one |   two | › three', '› x', 'below'], [2]],
  )
})

test('tab and shift+tab move between Tabs in the Places they name, even while a Line takes keys, and wrap at each end', async () => {
  const { rows, press, went } = await paged(['one', 'two', 'three'])
  await press('h', TAB, 'i')
  const next = await rows()
  await press(SHIFT_TAB, SHIFT_TAB)
  assert.deepEqual(
    [next, await rows(), went],
    [
      ['  one | › two |   three', '› hi', 'below'],
      ['  one |   two | › three', '› hi', 'below'],
      [1, 0, 2],
    ],
  )
})

test('Tabs wider than the screen draw the current tab, then its neighbours while they fit, and `more` marks each end where the row is cut', async () => {
  const { rows } = await paged(['alpha', 'beta', 'gamma', 'delta', 'epsilon'], { columns: 24, current: 2 })
  assert.deepEqual((await rows())[0], '… |   beta | › gamma | …')
})

test('a current tab wider than the row is cut with `more`, after the end markers', async () => {
  const { rows } = await paged(['a', 'a very long label', 'b'], { columns: 16, current: 1 })
  assert.deepEqual((await rows())[0], '… | › a ver… | …')
})

test('a click on a `more` or a separator of the Tabs does nothing, and a click on a tab goes to the tab drawn under it', async () => {
  const { press, went } = await paged(['alpha', 'beta', 'gamma', 'delta', 'epsilon'], { columns: 24, current: 2 })
  await press(clickAt(0, 0), clickAt(2, 0), clickAt(11, 0), clickAt(23, 0))
  const missed = [...went]
  await press(clickAt(6, 0))
  assert.deepEqual([missed, went], [[], [1]])
})

test('a current tab in a row with no room past its end markers is not drawn, and the row stays within the width', async () => {
  const { rows } = await paged(['a', 'a very long label', 'b'], { columns: 8, current: 1 })
  assert.deepEqual((await rows()).slice(0, 2), ['… |  | …', '›'])
})

test('a click on the `more` that cuts a current tab wider than the row does nothing, and a click on what it keeps goes to the tab', async () => {
  const { press, went } = await paged(['a', 'a very long label', 'b'], { columns: 16, current: 1 })
  await press(clickAt(11, 0))
  const missed = [...went]
  await press(clickAt(10, 0))
  assert.deepEqual([missed, went], [[], [1]])
})

test('a current tab past the last label draws the last as current, and tab and shift+tab move from it', async () => {
  const { rows, press, pages, went } = await paged(['one', 'two', 'three'], { current: 5 })
  const drawn = (await rows())[0]
  await press(TAB)
  pages.set((state) => (state.current = 5))
  await press(SHIFT_TAB)
  assert.deepEqual([drawn, went], ['  one |   two | › three', [0, 1]])
})

test('Tabs are drawn with the Looks of their kind and of their instance, in the theme’s separator', async () => {
  const { ctx, rows } = await paged(['one', 'two'])
  await ctx.plugin({
    name: 'looks',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ glyphs: { separator: ' / ' } })
      plugin.binnacle.look<TabLook>('tabs.tab', (beneath) => (label, at) => beneath(label.toUpperCase(), at))
      plugin.binnacle.look<TabLook>('pages.tab', (beneath) => (label, at) => `${at.index + 1}${beneath(label, at)}`)
    },
  })
  assert.deepEqual((await rows())[0], '1› ONE / 2  TWO')
})
