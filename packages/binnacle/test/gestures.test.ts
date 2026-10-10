import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { Part, Point } from '../src/api.ts'
import { mount } from './support/mount.ts'

/** A left-button press at the cell under the pointer, both counted from 0, as a terminal sends it. */
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`
const wheelUpAt = (x: number, y: number) => `\x1b[<64;${x + 1};${y + 1}M`
const SHIFT_TAB = '\x1b[Z'

const probe = (name: string, author: (plugin: Context) => void) => ({ name, inject: ['binnacle'], apply: author })

async function gestures(columns: number, rows: number, author: (plugin: Context) => void) {
  const mounted = await mount({ columns, rows })
  mounted.ready()
  const plugin = mounted.ctx.plugin(probe('author', author))
  await plugin
  return { ...mounted, plugin }
}

const inComposer = (plugin: Context, part: Part) => {
  plugin.binnacle.layout('composer', { place: 'composer.input' })
  plugin.binnacle.place('composer.input', part)
}

const takingKeys = (lines: readonly string[], cursor?: () => { line: number; column: number }) => {
  const keys: string[] = []
  return {
    keys,
    part: {
      lines: () => lines,
      ...(cursor === undefined ? {} : { cursor }),
      key: (data: string) => {
        keys.push(data)
        return false
      },
    },
  }
}

test('shift+tab moves the Focus to the next Place on view whose Part takes keys, in the order of the layout, and from the last back to the first', async () => {
  const seen: { x: number; y: number }[] = []
  const cursors = new Map([
    ['a', 0],
    ['b', 3],
    ['c', 6],
  ])
  const { terminal } = await gestures(10, 3, (plugin) => {
    plugin.binnacle.layout('chat', {
      column: [...cursors.keys()].map((place) => ({ place, size: 'content' })),
    })
    for (const [place, column] of cursors) plugin.binnacle.place(place, takingKeys([place], () => ({ line: 0, column })).part)
  })
  seen.push((await terminal.read()).cursor)
  for (let nth = 0; nth < 3; nth++) {
    terminal.type(SHIFT_TAB)
    seen.push((await terminal.read()).cursor)
  }
  assert.deepEqual(seen, [
    { x: 0, y: 0 },
    { x: 3, y: 1 },
    { x: 6, y: 2 },
    { x: 0, y: 0 },
  ])
})

test('a Screen that is shown has its own Focus. When it goes, the Screen under it has the Focus it had before.', async () => {
  const chat = takingKeys(['chat'])
  const over = takingKeys(['over'])
  const { ctx, terminal } = await gestures(10, 3, (plugin) => {
    inComposer(plugin, chat.part)
  })
  const shown = await ctx.plugin(
    probe('shown', (plugin) => {
      plugin.binnacle.show({ name: 'detail', focus: 'target', layout: { place: 'target' } })
      plugin.binnacle.place('target', over.part)
    }),
  )
  await shown
  await terminal.read()
  terminal.type('1')
  await shown.dispose()
  terminal.type('2')
  assert.deepEqual([over.keys, chat.keys], [['1'], ['2']])
})

test('a click on a Place whose Part takes keys gives that Place the Focus, and the cursor is drawn there', async () => {
  const a = takingKeys(['a'], () => ({ line: 0, column: 1 }))
  const b = takingKeys(['b'], () => ({ line: 0, column: 2 }))
  const { terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'b' }] })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.place('b', b.part)
  })
  const before = (await terminal.read()).cursor
  terminal.type(clickAt(7, 0))
  assert.deepEqual(
    [before, (await terminal.read()).cursor],
    [
      { x: 1, y: 0 },
      { x: 7, y: 0 },
    ],
  )
  terminal.type('k')
  assert.deepEqual([a.keys, b.keys], [[], ['k']])
})

test("when the Place with the Focus no longer takes keys, because its newest Part has no `key` or the Place is not on view, the Focus goes back to the Screen's own, else to the first Place in the layout that takes keys, else to no Place", async () => {
  const a = takingKeys(['a'])
  const b = takingKeys(['b'])
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.show({ name: 'two', focus: 'a', layout: { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'b' }] } })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.place('b', b.part)
  })
  await terminal.read()
  terminal.type(clickAt(7, 0))
  await ctx.plugin(
    probe('covered', (plugin) => {
      plugin.binnacle.place('b', { lines: () => ['no keys'] })
    }),
  )
  terminal.type('k')
  assert.deepEqual([a.keys, b.keys], [['k'], []])
})

test('a Part told the Focus can move the layout: the Focus and its notifications are settled again against what is drawn', async () => {
  const heard: [string, boolean][] = []
  const keys: [string, string[]][] = [
    ['a', []],
    ['b', []],
  ]
  const hears = (place: string, lines: () => string[]) => {
    let focused = false
    return {
      lines: () => (focused ? lines().slice(0, 1) : lines()),
      focus: (has: boolean) => {
        focused = has
        heard.push([place, has])
      },
      key: (data: string) => {
        keys.find(([name]) => name === place)![1].push(data)
        return false
      },
    }
  }
  const { terminal } = await gestures(10, 3, (plugin) => {
    plugin.binnacle.show({
      name: 'moving',
      focus: 'a',
      layout: { column: [{ place: 'a', size: 'content' }, { place: 'b' }] },
    })
    plugin.binnacle.place(
      'a',
      hears('a', () => ['> a', 'help', 'help']),
    )
    plugin.binnacle.place(
      'b',
      hears('b', () => ['b1', 'b2']),
    )
  })
  const focused = (await terminal.read()).rows
  terminal.type(clickAt(0, 2))
  const settled = (await terminal.read()).rows
  terminal.type('k')
  assert.deepEqual(
    [focused, settled, (await terminal.read()).rows, heard, keys],
    [
      ['> a', 'b1', 'b2'],
      ['> a', 'b1', 'b2'],
      ['> a', 'b1', 'b2'],
      [
        ['a', true],
        ['a', false],
        ['b', true],
        ['b', false],
        ['a', true],
      ],
      [
        ['a', ['k']],
        ['b', []],
      ],
    ],
  )
})

test('a Place with the Focus that is not on view gives the Focus to the first Place in the layout that takes keys', async () => {
  const a = takingKeys(['a'])
  const b = takingKeys(['b'])
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'b' }] })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.place('b', b.part)
  })
  await terminal.read()
  terminal.type(clickAt(7, 0))
  await ctx.plugin(
    probe('relaid', (plugin) => {
      plugin.binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'c' }] })
    }),
  )
  terminal.type('k')
  assert.deepEqual([a.keys, b.keys], [['k'], []])
})

test('with no Place on view that takes keys, no Part takes a key, and shift+tab does nothing', async () => {
  const { terminal } = await gestures(10, 2, (plugin) => {
    inComposer(plugin, { lines: () => ['plain'] })
  })
  const rows = (await terminal.read()).rows
  terminal.type('k')
  terminal.type(SHIFT_TAB)
  assert.deepEqual((await terminal.read()).rows, rows)
})

test('a mouse report of an additional button, or with motion set, is no gesture', async () => {
  const clicks: Point[] = []
  const { terminal } = await gestures(10, 3, (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'list' }] })
    plugin.binnacle.place('list', {
      lines: () => ['0', '1', '2', '3', '4', '5'],
      click: (at) => {
        clicks.push(at)
        return true
      },
    })
  })
  const rows = (await terminal.read()).rows
  terminal.type('\x1b[<128;1;1M')
  terminal.type('\x1b[<96;1;1M')
  assert.deepEqual([clicks, (await terminal.read()).rows], [[], rows])
})

test('a Part placed over the Part with the Focus takes the keys while it is the newest, and when it is disposed, the Part under it takes them again', async () => {
  const under = takingKeys(['under'])
  const over = takingKeys(['over'])
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.show({ name: 'one', focus: 'a', layout: { place: 'a' } })
    plugin.binnacle.place('a', under.part)
  })
  await terminal.read()
  terminal.type('1')
  const covered = await ctx.plugin(
    probe('covered', (plugin) => {
      plugin.binnacle.place('a', over.part)
    }),
  )
  terminal.type('2')
  await covered.dispose()
  terminal.type('3')
  assert.deepEqual([under.keys, over.keys], [['1', '3'], ['2']])
})

test('a key that the Part does not take goes to the core action that it is bound to, and a click goes to none', async () => {
  const draft = takingKeys(['draft'])
  const { ctx, terminal, exits } = await gestures(10, 2, (plugin) => {
    inComposer(plugin, draft.part)
  })
  await terminal.read()
  terminal.type('k')
  terminal.type('\x03')
  terminal.type('\x03')
  assert.deepEqual([draft.keys, exits], [['k', '\x03', '\x03'], [0]])
  const rows = (await terminal.read()).rows
  assert.deepEqual(ctx.binnacle.gestures.actionsOf('click'), [])
  terminal.type(clickAt(0, 0))
  assert.deepEqual((await terminal.read()).rows, rows)
})

test('a Part learns when its Place gains or loses the Focus, and is drawn again', async () => {
  const heard: boolean[] = []
  const shown = (mark: string) => {
    let focused = false
    return {
      lines: () => [`${focused ? '>' : ' '} ${mark}`],
      focus: (has: boolean) => {
        focused = has
        heard.push(has)
      },
      key: () => false,
    }
  }
  const a = shown('a')
  const b = shown('b')
  const { terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'b' }] })
    plugin.binnacle.place('a', a)
    plugin.binnacle.place('b', b)
  })
  const before = (await terminal.read()).rows
  terminal.type(clickAt(7, 0))
  assert.deepEqual(
    [before, heard, (await terminal.read()).rows],
    [
      ['> a    b', ''],
      [true, false, true],
      ['  a  > b', ''],
    ],
  )
})

test('a click on a Place whose Part takes no keys leaves the Focus where it was', async () => {
  const a = takingKeys(['a'], () => ({ line: 0, column: 1 }))
  const clicks: Point[] = []
  const { terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.layout('chat', { row: [{ place: 'a', size: { fixed: 5 } }, { place: 'b' }] })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.place('b', { lines: () => ['b'], click: (at) => (clicks.push(at), true) })
  })
  const before = (await terminal.read()).cursor
  terminal.type(clickAt(7, 0))
  terminal.type('k')
  assert.deepEqual(
    [before, (await terminal.read()).cursor, clicks, a.keys],
    [{ x: 1, y: 0 }, { x: 1, y: 0 }, [{ line: 0, column: 2 }], ['k']],
  )
})

test("a click on a Place's box, or on a row below the Part's lines, does not reach the Part", async () => {
  const clicks: Point[] = []
  const { terminal } = await gestures(10, 5, (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'a', size: { fixed: 5 }, border: true }] })
    plugin.binnacle.place('a', { lines: () => ['x'], click: (at) => (clicks.push(at), true) })
  })
  await terminal.read()
  const spots: readonly (readonly [number, number])[] = [
    [0, 0],
    [0, 4],
    [1, 1],
    [1, 2],
  ]
  for (const [x, y] of spots) terminal.type(clickAt(x, y))
  assert.deepEqual(clicks, [{ line: 0, column: 0 }])
})

test('a click on a Part reaches that Part with the line of its lines and the column, in cells, under the pointer', async () => {
  const clicks: Point[] = []
  const { terminal } = await gestures(10, 5, (plugin) => {
    plugin.binnacle.layout('chat', {
      column: [{ place: 'head', size: 'content', border: ['left'] }, { place: 'list' }],
    })
    plugin.binnacle.place('head', {
      lines: () => ['head'],
      click: (at) => {
        clicks.push(at)
        return false
      },
    })
    plugin.binnacle.place('list', {
      lines: () => ['abc def ghi jkl', 'second', 'third', 'fourth', 'fifth', 'sixth'],
      click: (at) => {
        clicks.push(at)
        return true
      },
    })
  })
  await terminal.read()
  const atItsEnd: readonly (readonly [number, number])[] = [
    [3, 1],
    [9, 1],
  ]
  const atItsStart: readonly (readonly [number, number])[] = [
    [2, 2],
    [5, 4],
  ]
  for (const [x, y] of atItsEnd) terminal.type(clickAt(x, y))
  terminal.type(wheelUpAt(0, 1))
  await terminal.read()
  for (const [x, y] of atItsStart) terminal.type(clickAt(x, y))
  terminal.type(clickAt(0, 0))
  terminal.type(clickAt(1, 0))
  assert.deepEqual(clicks, [
    { line: 2, column: 3 },
    { line: 2, column: 9 },
    { line: 0, column: 10 },
    { line: 2, column: 5 },
    { line: 0, column: 0 },
  ])
})

test('a Focus moved to a Place before the Place draws takes the Place once it draws, and is forgotten only after the Place has had the Focus and stopped taking keys', async () => {
  const a = takingKeys(['a'])
  const b = takingKeys(['b'])
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.show({ name: 'two', focus: 'a', layout: { column: [{ place: 'a' }, { place: 'b' }] } })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.focus('b')
  })
  await terminal.read()
  terminal.type('1')
  const drawn = ctx.plugin(
    probe('drawn', (plugin) => {
      plugin.binnacle.place('b', b.part)
    }),
  )
  await drawn
  terminal.type('2')
  const covered = ctx.plugin(
    probe('covered', (plugin) => {
      plugin.binnacle.place('b', { lines: () => ['no keys'] })
    }),
  )
  await covered
  terminal.type('3')
  await covered.dispose()
  terminal.type('4')
  assert.deepEqual([a.keys, b.keys], [['1', '3', '4'], ['2']])
})

test('an author moves the Focus to any Place by its name, and the Handle of a Place’s own Part moves it to that Place', async () => {
  const a = takingKeys(['a'])
  const b = takingKeys(['b'])
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.show({ name: 'two', focus: 'a', layout: { column: [{ place: 'a' }, { place: 'b' }] } })
    plugin.binnacle.place('a', a.part)
    plugin.binnacle.place('b', b.part)
  })
  await terminal.read()
  ctx.binnacle.focus('b')
  terminal.type('1')
  const handle = ctx.binnacle.place('a', a.part)
  terminal.type('2')
  handle.focus()
  terminal.type('3')
  assert.deepEqual([a.keys, b.keys], [['3'], ['1', '2']])
})

const numbered = (count: number) => Array.from({ length: count }, (_, nth) => `${nth}`)

test('an author scrolls a Place by pages of the rows its box shows, toward its last line when `pages` is positive, stops at its first and last line, and leaves the Focus where it was', async () => {
  const log = takingKeys(numbered(10))
  const line = takingKeys(['line'])
  const { ctx, terminal } = await gestures(10, 5, (plugin) => {
    plugin.binnacle.show({
      name: 'read',
      focus: 'line',
      layout: { row: [{ place: 'log', border: true, size: { fixed: 3 } }, { place: 'line' }] },
    })
    plugin.binnacle.place('log', log.part)
    plugin.binnacle.place('line', line.part)
  })
  const shown = async () => (await terminal.read()).rows.slice(1, 4).map((row) => row.slice(1, 2))
  const seen = [await shown()]
  for (const pages of [-1, -5, 1, 9]) {
    ctx.binnacle.scroll('log', pages)
    seen.push(await shown())
  }
  terminal.type('k')
  assert.deepEqual(
    [seen, log.keys, line.keys],
    [
      [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['0', '1', '2'],
        ['3', '4', '5'],
        ['7', '8', '9'],
      ],
      [],
      ['k'],
    ],
  )
})

test('a scroll of a Place that is not drawn, or that has no rows of room, does nothing', async () => {
  const { ctx, terminal } = await gestures(10, 5, (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'log', border: true, size: { fixed: 2 } }, { place: 'rest' }] })
    plugin.binnacle.place('log', { lines: () => numbered(10) })
  })
  await terminal.read()
  ctx.binnacle.scroll('log', -1)
  ctx.binnacle.scroll('elsewhere', -1)
  ctx.binnacle.layout('chat', { place: 'log' })
  assert.deepEqual((await terminal.read()).rows, ['5', '6', '7', '8', '9'])
})

test('a scroll of the Place with the Focus shows the paged rows over its Part’s cursor, until a key moves the cursor', async () => {
  const cursor = { line: 9, column: 0 }
  const { ctx, terminal } = await gestures(8, 3, (plugin) => {
    plugin.binnacle.show({ name: 'read', focus: 'log', layout: { place: 'log' } })
    plugin.binnacle.place('log', {
      lines: () => numbered(10),
      cursor: () => cursor,
      key: () => {
        cursor.line = 5
        return true
      },
    })
  })
  const seen = [(await terminal.read()).rows]
  ctx.binnacle.scroll('log', -1)
  seen.push((await terminal.read()).rows)
  ctx.binnacle.scroll('log', -1)
  seen.push((await terminal.read()).rows)
  terminal.type('k')
  seen.push((await terminal.read()).rows)
  ctx.binnacle.scroll('log', 1)
  seen.push((await terminal.read()).rows)
  assert.deepEqual(seen, [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['3', '4', '5'],
    ['6', '7', '8'],
  ])
})

test('a page starts from the rows the Place showed, where its Part’s cursor put them', async () => {
  const { ctx, terminal } = await gestures(8, 3, (plugin) => {
    plugin.binnacle.show({ name: 'read', focus: 'log', layout: { place: 'log' } })
    plugin.binnacle.place('log', { lines: () => numbered(10), cursor: () => ({ line: 2, column: 0 }), key: () => false })
  })
  const seen = [(await terminal.read()).rows]
  ctx.binnacle.scroll('log', -1)
  seen.push((await terminal.read()).rows)
  assert.deepEqual(seen, [
    ['2', '3', '4'],
    ['0', '1', '2'],
  ])
})

test('the wheel on a paged Place with the Focus shows its Part’s cursor again, as it does on a Place not paged', async () => {
  const { ctx, terminal } = await gestures(8, 3, (plugin) => {
    plugin.binnacle.show({ name: 'read', focus: 'log', layout: { place: 'log' } })
    plugin.binnacle.place('log', { lines: () => numbered(10), cursor: () => ({ line: 9, column: 0 }), key: () => false })
  })
  await terminal.read()
  ctx.binnacle.scroll('log', -2)
  await terminal.read()
  terminal.type(wheelUpAt(0, 0))
  assert.deepEqual((await terminal.read()).rows, ['7', '8', '9'])
})

test('the core sets its gestures as actions, and keysOf reads their keys', async () => {
  const { ctx } = await gestures(10, 2, () => {})
  const ids = [
    'binnacle.clear',
    'binnacle.interrupt',
    'binnacle.suspend',
    'binnacle.focus.next',
    'binnacle.scroll.up',
    'binnacle.scroll.down',
  ]
  assert.deepEqual(
    ids.map((id) => ctx.binnacle.keysOf(id)),
    [['ctrl+c'], ['escape'], ['ctrl+z'], ['shift+tab'], ['wheelup'], ['wheeldown']],
  )
})

test("actionsOf names the editor's actions, the core's, and each enabled action an author set that acts where the Focus is, but not one of another Place", async () => {
  const { ctx, terminal } = await gestures(10, 2, (plugin) => {
    plugin.binnacle.layout('chat', { column: [{ place: 'draft', size: 'content' }, { place: 'list' }] })
    plugin.binnacle.place('draft', takingKeys(['draft']).part)
    plugin.binnacle.place('list', { lines: () => ['list'] })
    plugin.binnacle.action('author.hide', { keys: ['escape'], run: () => {} })
    plugin.binnacle.action('author.draft', { keys: ['escape'], place: 'draft', run: () => {} })
    plugin.binnacle.action('author.list', { keys: ['escape'], place: 'list', run: () => {} })
    plugin.binnacle.action('author.off', { keys: ['escape'], enabled: () => false, run: () => {} })
  })
  await terminal.read()
  assert.deepEqual(
    new Set(ctx.binnacle.gestures.actionsOf('\x1b')),
    new Set(['tui.select.cancel', 'binnacle.interrupt', 'author.hide', 'author.draft']),
  )
})
