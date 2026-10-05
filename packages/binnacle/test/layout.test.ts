import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle } from '../src/api.ts'
import { mount } from './support/mount.ts'

async function drawn(columns: number, rows: number, author: (binnacle: Binnacle) => void) {
  const mounted = await mount({ columns, rows })
  mounted.ready()
  const plugin = mounted.ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (ctx: Context) => {
      author(ctx.binnacle)
    },
  })
  await plugin
  return { ...mounted, plugin, rows: (await mounted.terminal.read()).rows }
}

const part = (...lines: string[]) => ({ lines: () => lines })

test('Talk stacks the transcript, the status and the composer: the status and the composer take the rows their lines need, and the transcript the rest', async () => {
  const { rows } = await drawn(20, 6, (binnacle) => {
    binnacle.place('transcript', part('t1', 't2', 't3', 't4', 't5'))
    binnacle.place('status', part('working'))
    binnacle.place('composer', part('c1', 'c2'))
  })
  assert.deepEqual(rows, ['t3', 't4', 't5', 'working', 'c1', 'c2'])
})

test("a plugin replaces Talk's layout: the composer on top, and a sidebar of a fixed width beside the rest", async () => {
  const { rows } = await drawn(20, 4, (binnacle) => {
    binnacle.layout('talk', {
      row: [{ column: [{ place: 'composer', size: 'content' }, { place: 'transcript' }] }, { place: 'sidebar', size: { fixed: 6 } }],
    })
    binnacle.place('transcript', part('t1', 't2', 't3', 't4'))
    binnacle.place('composer', part('draft'))
    binnacle.place('sidebar', part('files', 'a.ts'))
  })
  assert.deepEqual(rows, ['draft         files', 't2            a.ts', 't3', 't4'])
})

test('a screen shown is drawn with its own layout over Talk, and Talk is drawn again once the plugin that showed it unloads', async () => {
  const { ctx, plugin, terminal, rows } = await drawn(20, 2, (binnacle) => {
    binnacle.place('transcript', part('talk'))
    binnacle.place('detail', part('a', 'b'))
    binnacle.show({ name: 'trajectory', layout: { row: [{ place: 'detail', size: { fixed: 4 } }, { place: 'transcript' }] } })
  })
  await plugin.dispose()
  await ctx.plugin({
    name: 'again',
    inject: ['binnacle'],
    apply: (again: Context) => {
      again.binnacle.place('transcript', part('talk'))
    },
  })
  assert.deepEqual(
    [rows, (await terminal.read()).rows],
    [
      ['a   talk', 'b'],
      ['talk', ''],
    ],
  )
})

test('a layout goes when the plugin that set it unloads, and the screen is drawn with the layout beneath', async () => {
  const { ctx, plugin, terminal, rows } = await drawn(20, 2, (binnacle) => {
    binnacle.layout('talk', { column: [{ place: 'sidebar' }] })
    binnacle.place('sidebar', part('side'))
  })
  await plugin.dispose()
  await ctx.plugin({
    name: 'again',
    inject: ['binnacle'],
    apply: (again: Context) => {
      again.binnacle.place('composer', part('draft'))
    },
  })
  assert.deepEqual(
    [rows, (await terminal.read()).rows],
    [
      ['side', ''],
      ['', 'draft'],
    ],
  )
})

const wheelUpAt = (column: number, row: number) => `\x1b[<64;${column};${row}M`

test('the wheel scrolls the place under the pointer, and no other', async () => {
  const { terminal, rows } = await drawn(10, 2, (binnacle) => {
    binnacle.layout('talk', { row: [{ place: 'transcript' }, { place: 'sidebar', size: { fixed: 5 } }] })
    binnacle.place('transcript', part('t1', 't2', 't3', 't4', 't5'))
    binnacle.place('sidebar', part('s1', 's2', 's3', 's4', 's5'))
  })
  terminal.type(wheelUpAt(7, 1))
  assert.deepEqual(
    [rows, (await terminal.read()).rows],
    [
      ['t4   s4', 't5   s5'],
      ['t4   s1', 't5   s2'],
    ],
  )
})

test('padding keeps blank cells inside a node, on each side or on the sides it names, and a gap keeps them between its children', async () => {
  const { rows } = await drawn(10, 6, (binnacle) => {
    binnacle.layout('talk', {
      column: [
        { place: 'a', size: 'content' },
        { place: 'b', size: 'content', padding: { left: 2 } },
      ],
      padding: 1,
      gap: 1,
    })
    binnacle.place('a', part('a'))
    binnacle.place('b', part('b'))
  })
  assert.deepEqual(rows, ['', ' a', '', '   b', '', ''])
})

test('a border is drawn with its edge, the theme’s rounded by default: on every side with a title set in its top, or on one side as a gutter', async () => {
  const { rows } = await drawn(12, 8, (binnacle) => {
    binnacle.layout('talk', {
      column: [
        { place: 'transcript', size: 'content', border: ['left'] },
        { place: 'composer', size: 'content', border: true, title: 'you' },
        { place: 'status', size: 'content', border: true, edge: 'heavy' },
      ],
    })
    binnacle.place('transcript', part('t1'))
    binnacle.place('composer', part('hi'))
    binnacle.place('status', part('x'))
  })
  assert.deepEqual(rows, ['│t1', '╭─ you ────╮', '│hi        │', '╰──────────╯', '┏━━━━━━━━━━┓', '┃x         ┃', '┗━━━━━━━━━━┛', ''])
})

test('a terminal too small for the layout loses padding first, then borders, and then the far rows', async () => {
  const seen: string[][] = []
  for (const height of [5, 4, 3, 1]) {
    const { rows } = await drawn(8, height, (binnacle) => {
      binnacle.layout('talk', {
        column: [
          { place: 'transcript' },
          { place: 'status', size: 'content' },
          { place: 'composer', size: 'content', border: true, padding: { top: 1 } },
        ],
      })
      binnacle.place('transcript', part('t'))
      binnacle.place('status', part('s'))
      binnacle.place('composer', part('c'))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['s', '╭──────╮', '│      │', '│c     │', '╰──────╯'],
    ['s', '╭──────╮', '│c     │', '╰──────╯'],
    ['t', 's', 'c'],
    ['s'],
  ])
})

test('a wide character never straddles the border between two places side by side', async () => {
  const { rows } = await drawn(10, 2, (binnacle) => {
    binnacle.layout('talk', { row: [{ place: 'a', size: { fixed: 3 } }, { place: 'b' }] })
    binnacle.place('a', part('日本'))
    binnacle.place('b', part('b'))
  })
  assert.deepEqual(rows, ['日 b', '本'])
})
