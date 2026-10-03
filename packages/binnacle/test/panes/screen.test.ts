import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Node } from '../../src/api.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { drawText } from '../support/draw.ts'
import { binnacleTheme, themed } from '../../src/ui/theme.ts'
import { pointer } from '../support/pointer.ts'
import { prompt } from '../support/facts.ts'

test('the pane draws what its placed screen returns, every line, for the scroll view it sits in', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: 'one' }) })
  assert.deepEqual(drawText(pane, 40), ['one'])
})

test('the screen is drawn and laid out again as its facts arrive, and not otherwise: a frame costs what changed', () => {
  const facts: Fact[] = [prompt(1, 1, 'fix the build')]
  const handed: (readonly Fact[])[] = []
  const pane = new ScreenPane(() => facts)
  pane.place('trajectory', {
    draw: (given) => {
      handed.push([...given])
      return { kind: 'text', text: `lines ${given.length}` }
    },
  })
  drawText(pane, 40)
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]], 'the same facts, width and state draw once, however many frames pass')
  facts.push(prompt(2, 2, 'and the tests'))
  drawText(pane, 40)
  assert.deepEqual(handed, [[prompt(1, 1, 'fix the build')]], 'facts the pane was not told of change nothing')
  pane.factsChanged()
  assert.deepEqual(drawText(pane, 40), ['lines 2'])
  assert.deepEqual(
    handed.at(-1),
    [prompt(1, 1, 'fix the build'), prompt(2, 2, 'and the tests')],
    'told of its facts, the screen draws them as they now stand',
  )
})

test('the screen is drawn in the theme as it stands, and laid out again when it changes', () => {
  let theme = binnacleTheme
  const pane = new ScreenPane(
    () => [],
    {},
    () => theme,
  )
  pane.place('trajectory', { draw: () => ({ kind: 'text', text: [{ mark: 'prompt' }, ' asked'] }) })
  assert.deepEqual(drawText(pane, 40), ['› asked'])
  theme = themed(binnacleTheme, [{ marks: { prompt: { glyph: '>' } } }])
  assert.deepEqual(drawText(pane, 40), ['> asked'])
})

test('a drawing that throws draws what went wrong, naming its registration, and the pane stays up', () => {
  const pane = new ScreenPane(() => [])
  pane.place('trajectory', {
    draw: () => {
      throw new Error('no phone')
    },
  })
  assert.deepEqual(drawText(pane, 60), ['✗ binnacle.screen(trajectory) threw: no phone'])
})

test('a drawing that returns no node binnacle can lay out draws what went wrong likewise', () => {
  const pane = new ScreenPane(() => [])
  pane.place('trajectory', { draw: () => ({ kind: 'shrug' }) as unknown as Node })
  assert.deepEqual(drawText(pane, 100), ['✗ binnacle.screen(trajectory) returned no drawable node: shrug is no kind of node'])
})

/** A screen that holds one fold, cut to nothing, over two lines of record. */
function foldScreen(): { readonly draw: (facts: readonly Fact[]) => Node } {
  return {
    draw: () => ({
      kind: 'stack',
      children: [
        { kind: 'text', text: 'one line' },
        { kind: 'fold', id: 'record', rows: 0, child: { kind: 'text', text: 'the\nrecord' } },
      ],
    }),
  }
}

test('a placed screen holds UI state of its own: a click opens a fold, and a click on the open one folds it again', () => {
  const pane = new ScreenPane(() => [])
  pane.place('screened', foldScreen())
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(drawText(pane, 40), ['one line', 'the', 'record'])
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
})

test('enter opens the fold a person focused, and the focus row says what it will do, as on the transcript', () => {
  const pane = new ScreenPane(() => [])
  pane.place('screened', foldScreen())
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '▸ show 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', 'the', 'record', '▸ fold it away'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '▸ show 2 more lines'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.out' }), true)
  assert.deepEqual(drawText(pane, 40), ['one line', '… 2 more lines'])
})

test('focus moved by a key is reported with its rows, to be brought into view', () => {
  const inView: [number, number][] = []
  const pane = new ScreenPane(() => [], {
    inView: (top, height) => {
      inView.push([top, height])
    },
  })
  pane.place('screened', foldScreen())
  drawText(pane, 40)
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(inView, [[1, 1]])
})

/** A screen whose one offer says what it is: the region an invocation lands on. */
function offerScreen(): { readonly draw: () => Node } {
  return {
    draw: () => ({
      kind: 'stack',
      children: [{ kind: 'offer', id: 'reply', affordances: [{ kind: 'answer', label: 'reply' }], child: { kind: 'text', text: 'reply' } }],
    }),
  }
}

test('an offer invoked by a key or a click reaches the registration’s invoke, and a report that throws is drawn, not thrown', () => {
  const invoked: string[] = []
  let fail = false
  const pane = new ScreenPane(() => [], {
    changed: () => {},
    invoked: (region, affordance) => {
      invoked.push(`${region} ${affordance}`)
      if (fail) throw new Error('author invoke failed')
    },
  })
  pane.place('seat', offerScreen(), 'binnacle.place(composer)')
  assert.deepEqual(drawText(pane, 70), ['reply'])
  // A key invokes the focused offer; the pane stays up when the report throws, and what went wrong is drawn, naming the registration.
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.next' }), true)
  fail = true
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(invoked, ['reply answer'])
  assert.deepEqual(drawText(pane, 70), ['reply', '▸ reply', '✗ binnacle.place(composer) invoke threw: author invoke failed'])
  // A click invokes the offer under it the same way, fenced the same way; a report that returns draws the lines clean again.
  fail = false
  assert.deepEqual(pane.handleMouse(pointer('click', 1)), { handled: true })
  assert.deepEqual(invoked, ['reply answer', 'reply answer'])
  assert.deepEqual(drawText(pane, 70), ['reply', '▸ reply'])
})

test('a key bound to copy on a focused show on a placed screen hands the host all it holds, not the placement', () => {
  const copied: string[] = []
  const invoked: string[] = []
  const pane = new ScreenPane(() => [], {
    copy: (text) => {
      copied.push(text)
    },
    invoked: (_region, affordance) => {
      invoked.push(affordance)
    },
  })
  pane.place('cards', {
    draw: () => ({
      kind: 'show',
      title: ['● pnpm test'],
      opens: 'output',
      child: { kind: 'fold', id: 'output', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } },
    }),
  })
  drawText(pane, 40)
  pane.handleKey({ kind: 'key', binding: 'focus.next' })
  drawText(pane, 40)
  pane.handleKey({ kind: 'key', binding: 'copy' })
  assert.deepEqual(copied, ['a\nb\nc'])
  assert.deepEqual(invoked, [])
})

/** An ask of `count` offers, each one row, titled as given. */
const offered = (title: string, count: number): Node => ({
  kind: 'ask',
  title,
  child: {
    kind: 'stack',
    children: Array.from({ length: count }, (_, at): Node => ({
      kind: 'offer',
      id: `o${at + 1}`,
      affordances: [{ kind: 'choose', label: `option ${at + 1}` }],
      child: { kind: 'text', text: `option ${at + 1}` },
    })),
  },
})

/** An ask of six rows of prose over three offers, titled as given. */
const paged = (title: string): Node => ({
  kind: 'ask',
  title,
  child: {
    kind: 'stack',
    children: [
      ...Array.from({ length: 6 }, (_, row): Node => ({ kind: 'text', text: `p${row + 1}` })),
      ...(['one', 'two', 'three'] as const).map((text, at): Node => ({
        kind: 'offer',
        id: `o${at + 1}`,
        affordances: [{ kind: 'choose', label: `option ${at + 1}` }],
        child: { kind: 'text', text },
      })),
    ],
  },
})

test('a pane given a room pages its ask by keys and keeps the page it drew, clamped', () => {
  const pane = new ScreenPane(
    () => [],
    {},
    () => binnacleTheme,
    () => undefined,
    () => undefined,
    () => 10,
  )
  pane.place('asked', { draw: () => paged('plan') })
  pane.handleKey({ kind: 'key', binding: 'focus.next' })
  assert.deepEqual(
    drawText(pane, 60)
      .slice(1, -1)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['p1', 'p2', 'p3', 'p4', 'page 1/2', 'one', 'two', 'three'],
  )
  assert.equal(pane.handleKey({ kind: 'key', binding: 'page.next' }), true)
  assert.deepEqual(
    drawText(pane, 60)
      .slice(1, -1)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['p4', 'p5', 'p6', 'page 2/2', '', 'one', 'two', 'three'],
  )
  // At the last page, paging on is answered but moves nothing, and paging back returns.
  assert.equal(pane.handleKey({ kind: 'key', binding: 'page.next' }), true)
  assert.equal(pane.handleKey({ kind: 'key', binding: 'page.previous' }), true)
  assert.deepEqual(
    drawText(pane, 60)
      .slice(1, -1)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['p1', 'p2', 'p3', 'p4', 'page 1/2', 'one', 'two', 'three'],
  )
})

test('a pane given a room jumps focus a window of offers on, and the window follows', () => {
  const pane = new ScreenPane(
    () => [],
    {},
    () => binnacleTheme,
    () => undefined,
    () => undefined,
    () => 8,
  )
  pane.place('asked', { draw: () => offered('pick', 20) })
  pane.handleKey({ kind: 'key', binding: 'focus.next' })
  assert.deepEqual(
    drawText(pane, 30)
      .slice(1, -1)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['option 1', 'option 2', 'option 3', 'option 4', 'option 5', 'option 6'],
  )
  assert.equal(pane.handleKey({ kind: 'key', binding: 'jump.next' }), true)
  assert.deepEqual(
    drawText(pane, 30)
      .slice(1, -1)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['option 3', 'option 4', 'option 5', 'option 6', 'option 7', '▸ option 7'],
  )
  assert.equal(drawText(pane, 30).at(-1), '╰─ 7/20 ─────────────────────╯')
})

test('a placed ask whose rows are not a whole number from 3 draws what went wrong, naming them', () => {
  const pane = new ScreenPane(() => [])
  pane.place('asked', { draw: () => ({ kind: 'ask', rows: 2, child: { kind: 'text', text: 'one' } }) as unknown as Node })
  assert.deepEqual(drawText(pane, 100), [
    "✗ binnacle.screen(asked) returned no drawable node: an ask's rows are 2, not a whole number of rows",
    'from 3',
  ])
})

test('a room that changes with the terminal is read on every frame: the ask is drawn at the room it now has', () => {
  let room: number | undefined = 8
  const pane = new ScreenPane(
    () => [],
    {},
    () => binnacleTheme,
    () => undefined,
    () => undefined,
    () => room,
  )
  pane.place('asked', { draw: () => offered('pick', 20) })
  assert.equal(drawText(pane, 30).length, 8)
  assert.equal(drawText(pane, 30).length, 8, 'the same frame again')
  room = 12
  assert.equal(drawText(pane, 30).length, 12, 'a taller terminal gives the ask a taller room')
  room = undefined
  assert.equal(drawText(pane, 30).length, 22, 'a place that gives no room draws the ask whole')
})
