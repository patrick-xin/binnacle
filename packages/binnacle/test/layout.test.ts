import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Layout, Point } from '../src/api.ts'
import { CHAT_LAYOUT, createModel } from '../src/index.ts'
import { mount } from './support/mount.ts'

const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`

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

test('a node is of one kind, a Place, a row, a column, a named Layout, a first or a float, never two at once', () => {
  // @ts-expect-error A node with both a place and a row has no meaning.
  const mixed: Layout = { place: 'a', row: [] }
  // @ts-expect-error A float over a named Layout is a node of its own.
  const floating: Layout = { layout: 'a', over: { place: 'b' }, float: { place: 'c' } }
  assert.ok(mixed && floating)
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

test('a Part with the Focus, longer than its Place, shows the row of its cursor, and the terminal cursor is put there', async () => {
  const { terminal, rows } = await drawn(10, 3, (binnacle) => {
    binnacle.show({ name: 'editing', focus: 'a', layout: { place: 'a' } })
    binnacle.place('a', { lines: () => ['1', '2', '3', '4', '5', '6'], key: () => false, cursor: () => ({ line: 1, column: 1 }) })
  })
  assert.deepEqual([rows, (await terminal.read()).cursor], [['2', '3', '4'], { x: 1, y: 0 }])
})

test("a cursor in a line that wraps is put on the row and the column it wraps to, inside the Place's box", async () => {
  const { terminal, rows } = await drawn(12, 4, (binnacle) => {
    binnacle.show({ name: 'editing', focus: 'a', layout: { place: 'a', border: true } })
    binnacle.place('a', { lines: () => ['abcdefghijklmno'], key: () => false, cursor: () => ({ line: 0, column: 12 }) })
  })
  assert.deepEqual(
    [rows, (await terminal.read()).cursor],
    [['╭──────────╮', '│abcdefghij│', '│klmno     │', '╰──────────╯'], { x: 3, y: 2 }],
  )
})

async function cursorInWrappedLineAt(column: number) {
  const { terminal } = await drawn(5, 3, (binnacle) => {
    binnacle.show({ name: 'editing', focus: 'a', layout: { place: 'a' } })
    binnacle.place('a', { lines: () => ['aaaa bbbb cccc'], key: () => false, cursor: () => ({ line: 0, column }) })
  })
  return (await terminal.read()).cursor
}

test('a cursor in a line that wraps at its spaces is put on the word it is in, and at the end of the line where it ends it', async () => {
  assert.deepEqual(
    [await cursorInWrappedLineAt(11), await cursorInWrappedLineAt(9), await cursorInWrappedLineAt(14)],
    [
      { x: 1, y: 2 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
    ],
  )
})

test('a `{ layout: name }` node draws the Layout set by that name, and takes no cells at all, its box included, while that Layout has nothing to draw', async () => {
  const seen: string[][] = []
  for (const ask of [undefined, [], ['ask?']]) {
    const { rows } = await drawn(10, 8, (binnacle) => {
      binnacle.layout('chat', {
        column: [
          { place: 'transcript' },
          { layout: 'request', size: 'content', border: true, padding: { top: 1 } },
          { place: 'composer', size: 'content' },
        ],
        gap: 1,
      })
      if (ask !== undefined) binnacle.layout('request', { place: 'ask' })
      binnacle.place('transcript', part('t1', 't2', 't3'))
      binnacle.place('composer', part('c'))
      binnacle.place('ask', part(...(ask ?? [])))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['t1', 't2', 't3', '', '', '', '', 'c'],
    ['t1', 't2', 't3', '', '', '', '', 'c'],
    ['t3', '', '╭────────╮', '│        │', '│ask?    │', '╰────────╯', '', 'c'],
  ])
})

test('a `{ first: [...] }` node draws only its first child that has a line to draw', async () => {
  const seen: string[][] = []
  for (const notice of [[], ['notice']]) {
    const { rows } = await drawn(10, 2, (binnacle) => {
      binnacle.layout('chat', {
        column: [
          { place: 'transcript' },
          { first: [{ place: 'notice' }, { place: 'empty' }, { place: 'status' }, { place: 'hint' }], size: 'content' },
        ],
      })
      binnacle.place('transcript', part('t'))
      binnacle.place('notice', part(...notice))
      binnacle.place('status', part('working'))
      binnacle.place('hint', part('hint'))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['t', 'working'],
    ['t', 'notice'],
  ])
})

test('an `{ over, float, at }` node draws `float` on top of `over` while `float` has a line to draw, and a click lands on the float before what it covers', async () => {
  const clicked: string[] = []
  const clicking = (name: string, lines: () => readonly string[]) => ({
    lines,
    models: [menu],
    click: (at: Point) => {
      clicked.push(`${name} ${at.line}:${at.column}`)
      return true
    },
  })
  const menu = createModel<{ lines: readonly string[] }>({ lines: ['m'] })
  const { terminal, rows } = await drawn(10, 5, (binnacle) => {
    binnacle.layout('chat', { over: { place: 'transcript' }, float: { place: 'menu', border: true }, at: { width: 6 } })
    binnacle.place(
      'transcript',
      clicking('transcript', () => Array.from({ length: 5 }, () => 'aaaaaaaaaa')),
    )
    binnacle.place(
      'menu',
      clicking('menu', () => menu.state.lines),
    )
  })
  terminal.type(clickAt(3, 2))
  terminal.type(clickAt(0, 2))
  menu.set((state) => {
    state.lines = []
  })
  const covered = (await terminal.read()).rows
  terminal.type(clickAt(3, 2))
  assert.deepEqual(
    [rows, covered, clicked],
    [
      ['aaaaaaaaaa', 'aa╭────╮aa', 'aa│m   │aa', 'aa╰────╯aa', 'aaaaaaaaaa'],
      ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaaa'],
      ['menu 0:0', 'transcript 2:0', 'transcript 2:3'],
    ],
  )
})

test('a node with `unless: name` draws nothing while the Layout or the Place by that name has a line to draw', async () => {
  const seen: string[][] = []
  for (const [request, notice] of [
    [[], []],
    [['ask?'], []],
    [[], ['note']],
  ]) {
    const { rows } = await drawn(10, 5, (binnacle) => {
      binnacle.layout('chat', {
        column: [
          { place: 'transcript' },
          { layout: 'request', size: 'content' },
          { place: 'composer', size: 'content', unless: 'request', border: ['top'] },
          { place: 'status', size: 'content', unless: 'notice' },
          { place: 'notice', size: 'content' },
        ],
      })
      binnacle.layout('request', { place: 'ask' })
      binnacle.place('transcript', part('t'))
      binnacle.place('ask', part(...(request ?? [])))
      binnacle.place('composer', part('c'))
      binnacle.place('status', part('s'))
      binnacle.place('notice', part(...(notice ?? [])))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['t', '', '──────────', 'c', 's'],
    ['t', '', '', 'ask?', 's'],
    ['t', '', '──────────', 'c', 'note'],
  ])
})

test('a node with `mouse: false` ignores a click and the wheel inside it, and a click there moves no Focus', async () => {
  const heard: string[] = []
  const taking = (name: string) => ({
    lines: () => ['1', '2', '3', '4'].map((line) => `${name}${line}`),
    key: (data: string) => {
      heard.push(`${name} ${data}`)
      return true
    },
    click: () => {
      heard.push(`${name} click`)
      return true
    },
  })
  const { terminal, rows } = await drawn(10, 2, (binnacle) => {
    binnacle.show({
      name: 'two',
      focus: 'b',
      layout: { row: [{ column: [{ place: 'a' }], size: { fixed: 5 }, mouse: false }, { place: 'b' }] },
    })
    binnacle.place('a', taking('a'))
    binnacle.place('b', taking('b'))
  })
  terminal.type(clickAt(1, 0))
  terminal.type(wheelUpAt(2, 1))
  terminal.type('k')
  terminal.type(clickAt(6, 0))
  assert.deepEqual(
    [rows, (await terminal.read()).rows, heard],
    [
      ['a3   b3', 'a4   b4'],
      ['a3   b3', 'a4   b4'],
      ['b k', 'b click'],
    ],
  )
})

test("in a Layout set by name, a node with no size takes what its lines need; in a Screen's own Layout it fills, as before", async () => {
  const panel: Layout = { column: [{ place: 'a' }, { place: 'b' }] }
  const seen: string[][] = []
  for (const chat of [
    { column: [{ layout: 'panel', size: { fixed: 4 } }, { place: 'c' }] },
    { column: [{ ...panel, size: { fixed: 4 } }, { place: 'c' }] },
  ] satisfies Layout[]) {
    const { rows } = await drawn(10, 5, (binnacle) => {
      binnacle.layout('chat', chat)
      binnacle.layout('panel', panel)
      binnacle.place('a', part('a'))
      binnacle.place('b', part('b'))
      binnacle.place('c', part('c'))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['a', 'b', '', '', 'c'],
    ['a', '', 'b', '', 'c'],
  ])
})

test("the Chat's own Layout is exported as `CHAT_LAYOUT`, and an author builds on it to move one node", async () => {
  const { rows } = await drawn(10, 4, (binnacle) => {
    const composer = CHAT_LAYOUT.column.filter((node) => node.place === 'composer')
    binnacle.layout('chat', { ...CHAT_LAYOUT, column: [...composer, ...CHAT_LAYOUT.column.filter((node) => node.place !== 'composer')] })
    binnacle.place('transcript', part('t1', 't2', 't3'))
    binnacle.place('status', part('working'))
    binnacle.place('composer', part('draft'))
  })
  assert.deepEqual(rows, ['draft', 't2', 't3', 'working'])
})

test('a named Layout that draws itself, or hides itself by `unless`, draws nothing the second time, and binnacle still draws', async () => {
  const { rows } = await drawn(10, 3, (binnacle) => {
    binnacle.layout('chat', { column: [{ layout: 'loop' }, { place: 'c', size: 'content' }] })
    binnacle.layout('loop', { column: [{ place: 'a' }, { place: 'x', unless: 'loop' }, { layout: 'loop' }] })
    binnacle.place('a', part('a'))
    binnacle.place('x', part('x'))
    binnacle.place('c', part('c'))
  })
  assert.deepEqual(rows, ['a', '', 'c'])
})

const answering = (name: string, lines: readonly string[], heard: string[]) => ({
  lines: () => lines,
  key: (data: string) => {
    heard.push(`${name} ${data}`)
    return true
  },
  click: (at: Point) => {
    heard.push(`${name} click ${at.line}:${at.column}`)
    return true
  },
})

test('a click and the wheel on the box of a float, its border included, reach nothing beneath it, and move no Focus', async () => {
  const heard: string[] = []
  const { terminal, rows } = await drawn(10, 5, (binnacle) => {
    binnacle.show({
      name: 'menu',
      focus: 'menu',
      layout: { over: { place: 'base' }, float: { column: [{ place: 'menu' }], border: true }, at: { width: 6 } },
    })
    binnacle.place(
      'base',
      answering(
        'base',
        Array.from({ length: 10 }, (_, line) => `${line}`.repeat(10)),
        heard,
      ),
    )
    binnacle.place('menu', answering('menu', ['M'], heard))
  })
  terminal.type(clickAt(3, 1))
  terminal.type(wheelUpAt(4, 2))
  terminal.type('k')
  terminal.type(clickAt(3, 2))
  assert.deepEqual(
    [rows, (await terminal.read()).rows, heard],
    [
      ['5555555555', '66╭────╮66', '77│M   │77', '88╰────╯88', '9999999999'],
      ['5555555555', '66╭────╮66', '77│M   │77', '88╰────╯88', '9999999999'],
      ['menu k', 'menu click 0:0'],
    ],
  )
})

test('a click lands on the topmost of floats inside floats', async () => {
  const heard: string[] = []
  const { terminal, rows } = await drawn(10, 5, (binnacle) => {
    binnacle.layout('chat', {
      over: { place: 'base' },
      float: { over: { place: 'middle' }, float: { place: 'inner' }, at: { width: 2 } },
      at: { width: 6 },
    })
    binnacle.place('base', answering('base', ['7777777777', '7777777777', '7777777777', '7777777777', '7777777777'], heard))
    binnacle.place('middle', answering('middle', ['bbbbbb', 'bbbbbb', 'bbbbbb'], heard))
    binnacle.place('inner', answering('inner', ['II'], heard))
  })
  terminal.type(clickAt(4, 2))
  terminal.type(clickAt(2, 2))
  terminal.type(clickAt(0, 2))
  await terminal.read()
  assert.deepEqual([rows[2], heard], ['77bbIIbb77', ['inner click 0:0', 'middle click 1:0', 'base click 2:0']])
})

test('a float with a line to draw, over what has none, has a line to draw: a named Layout draws it, and a `first` picks it', async () => {
  const panel: Layout = { size: 'fill', over: { place: 'empty' }, float: { place: 'menu' }, at: { width: 6 } }
  const seen: string[][] = []
  for (const chat of [{ layout: 'panel' }, { first: [panel, { place: 'fallback' }] }] satisfies Layout[]) {
    const { rows } = await drawn(10, 3, (binnacle) => {
      binnacle.layout('chat', chat)
      binnacle.layout('panel', panel)
      binnacle.place('menu', part('M'))
      binnacle.place('fallback', part('fallback'))
    })
    seen.push(rows)
  }
  assert.deepEqual(seen, [
    ['', '  M', ''],
    ['', '  M', ''],
  ])
})

test('a float with no size in a named Layout takes the width its lines need, with the margin that a float keeps on each side', async () => {
  const { rows } = await drawn(10, 2, (binnacle) => {
    binnacle.layout('chat', { layout: 'panel' })
    binnacle.layout('panel', {
      row: [
        { over: { place: 'empty' }, float: { place: 'menu' } },
        { place: 'rest', size: 'fill' },
      ],
    })
    binnacle.place('menu', part('M'))
    binnacle.place('rest', part('rest'))
  })
  assert.deepEqual(rows, ['  M  rest', ''])
})
