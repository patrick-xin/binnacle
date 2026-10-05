import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Layout } from '../src/api.ts'
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

test('the Chat stacks the transcript, the status and the composer: the status and the composer take the rows their lines need, and the transcript the rest', async () => {
  const { rows } = await drawn(20, 6, (binnacle) => {
    binnacle.place('transcript', part('t1', 't2', 't3', 't4', 't5'))
    binnacle.place('status', part('working'))
    binnacle.place('composer', part('c1', 'c2'))
  })
  assert.deepEqual(rows, ['t3', 't4', 't5', 'working', 'c1', 'c2'])
})

test("a plugin replaces the Chat's layout: the composer on top, and a sidebar of a fixed width beside the rest", async () => {
  const { rows } = await drawn(20, 4, (binnacle) => {
    binnacle.layout('chat', {
      row: [{ column: [{ place: 'composer', size: 'content' }, { place: 'transcript' }] }, { place: 'sidebar', size: { fixed: 6 } }],
    })
    binnacle.place('transcript', part('t1', 't2', 't3', 't4'))
    binnacle.place('composer', part('draft'))
    binnacle.place('sidebar', part('files', 'a.ts'))
  })
  assert.deepEqual(rows, ['draft         files', 't2            a.ts', 't3', 't4'])
})

test('a Screen shown is drawn with its own layout over the Chat, and the Chat is drawn again once the plugin that showed it unloads', async () => {
  const { ctx, plugin, terminal, rows } = await drawn(20, 2, (binnacle) => {
    binnacle.place('transcript', part('chat'))
    binnacle.place('detail', part('a', 'b'))
    binnacle.show({ name: 'trajectory', layout: { row: [{ place: 'detail', size: { fixed: 4 } }, { place: 'transcript' }] } })
  })
  await plugin.dispose()
  await ctx.plugin({
    name: 'again',
    inject: ['binnacle'],
    apply: (again: Context) => {
      again.binnacle.place('transcript', part('chat'))
    },
  })
  assert.deepEqual(
    [rows, (await terminal.read()).rows],
    [
      ['a   chat', 'b'],
      ['chat', ''],
    ],
  )
})

test('a layout goes when the plugin that set it unloads, and the Screen is drawn with the layout beneath', async () => {
  const { ctx, plugin, terminal, rows } = await drawn(20, 2, (binnacle) => {
    binnacle.layout('chat', { column: [{ place: 'sidebar' }] })
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

test('the wheel scrolls the Place under the pointer, and no other', async () => {
  const { terminal, rows } = await drawn(10, 2, (binnacle) => {
    binnacle.layout('chat', { row: [{ place: 'transcript' }, { place: 'sidebar', size: { fixed: 5 } }] })
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
    binnacle.layout('chat', {
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
    binnacle.layout('chat', {
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
      binnacle.layout('chat', {
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

test('a wide character never straddles the border between two Places side by side', async () => {
  const { rows } = await drawn(10, 2, (binnacle) => {
    binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 3 } }, { place: 'b' }] })
    binnacle.place('a', part('日本'))
    binnacle.place('b', part('b'))
  })
  assert.deepEqual(rows, ['日 b', '本'])
})

test('a column draws every row it is given, so its bottom border closes at its last row and the Place under it stays at the bottom', async () => {
  const { rows } = await drawn(10, 5, (binnacle) => {
    binnacle.layout('chat', {
      column: [
        { column: [{ place: 'a', size: 'content' }], border: true },
        { place: 'c', size: 'content' },
      ],
    })
    binnacle.place('a', part('a'))
    binnacle.place('c', part('c'))
  })
  assert.deepEqual(rows, ['╭────────╮', '│a       │', '│        │', '╰────────╯', 'c'])
})

test('a node given fewer rows than its own box gives up its padding, then its border, before its rows are cut', async () => {
  const seen: string[][] = []
  for (const height of [3, 1]) {
    const { rows } = await drawn(10, height, (binnacle) => {
      binnacle.layout('chat', { column: [{ place: 'a', border: true, padding: 1 }] })
      binnacle.place('a', part('a1', 'a2'))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [['╭────────╮', '│a2      │', '╰────────╯'], ['a2']])
})

test('a title is drawn as plain text, and a title too long for its border is cut at a whole character', async () => {
  const seen: string[] = []
  for (const title of ['x\ny\x1b[31mred', 'Transcript title long']) {
    const { rows } = await drawn(16, 3, (binnacle) => {
      binnacle.layout('chat', { column: [{ place: 'a', border: true, title }] })
    })
    seen.push(rows[0] ?? '')
  }
  assert.deepEqual(seen, ['╭─ xyred ──────╮', '╭─ Transcript ─╮'])
})

test('a size, a padding or a gap of fewer than no cells, or of part of a cell, is drawn as the whole cells it holds, never fewer than none', async () => {
  const { rows } = await drawn(5, 2, (binnacle) => {
    binnacle.layout('chat', {
      column: [
        { place: 'a', size: { fixed: -3 } },
        { place: 'b', padding: -1 },
      ],
      gap: 0.5,
    })
    binnacle.place('a', part('a'))
    binnacle.place('b', part('b1', 'b2', 'b3'))
  })
  assert.deepEqual(rows, ['b2', 'b3'])
})

test('the wheel over a Place’s border scrolls the Place', async () => {
  const { terminal } = await drawn(10, 3, (binnacle) => {
    binnacle.layout('chat', { column: [{ place: 'a', border: true }] })
    binnacle.place('a', part('a1', 'a2', 'a3', 'a4'))
  })
  terminal.type(wheelUpAt(1, 1))
  assert.deepEqual((await terminal.read()).rows, ['╭────────╮', '│a1      │', '╰────────╯'])
})

test('a node is a Place, a row or a column, never two at once', () => {
  // @ts-expect-error A node with both a place and a row has no meaning.
  const mixed: Layout = { place: 'a', row: [] }
  assert.ok(mixed)
})

test('a gap wider than the room between its children is given up before their rows are cut', async () => {
  const { rows } = await drawn(6, 3, (binnacle) => {
    binnacle.layout('chat', { column: [{ place: 'a' }, { place: 'b' }], gap: 5 })
    binnacle.place('a', part('a'))
    binnacle.place('b', part('b'))
  })
  assert.deepEqual(rows, ['a', '', 'b'])
})

test("a Part's colour stays inside its Place: its border and the Place beside it are drawn in the default colour", async () => {
  const { terminal, rows } = await drawn(12, 3, (binnacle) => {
    binnacle.layout('chat', { row: [{ place: 'a', border: true, size: { fixed: 6 } }, { place: 'b' }] })
    binnacle.place('a', part('\x1b[31mred'))
    binnacle.place('b', part('b'))
  })
  const colours = await Promise.all([terminal.colourAt(1, 1), terminal.colourAt(5, 1), terminal.colourAt(6, 0)])
  assert.deepEqual(
    [rows, colours],
    [
      ['╭────╮b', '│red │', '╰────╯'],
      [1, 'default', 'default'],
    ],
  )
})

test('a focused Part longer than its Place shows the row of its cursor, and the terminal cursor is put there', async () => {
  const { terminal, rows } = await drawn(10, 3, (binnacle) => {
    binnacle.show({ name: 'editing', focus: 'a', layout: { place: 'a' } })
    binnacle.place('a', { lines: () => ['1', '2', '3', '4', '5', '6'], cursor: () => ({ line: 1, column: 1 }) })
  })
  assert.deepEqual([rows, (await terminal.read()).cursor], [['2', '3', '4'], { x: 1, y: 0 }])
})

test("a cursor in a line that wraps is put on the row and the column it wraps to, inside the Place's box", async () => {
  const { terminal, rows } = await drawn(12, 4, (binnacle) => {
    binnacle.show({ name: 'editing', focus: 'a', layout: { place: 'a', border: true } })
    binnacle.place('a', { lines: () => ['abcdefghijklmno'], cursor: () => ({ line: 0, column: 12 }) })
  })
  assert.deepEqual(
    [rows, (await terminal.read()).cursor],
    [['╭──────────╮', '│abcdefghij│', '│klmno     │', '╰──────────╯'], { x: 3, y: 2 }],
  )
})
