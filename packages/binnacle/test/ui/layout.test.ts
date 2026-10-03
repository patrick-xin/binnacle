import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { extent, layout, under } from '../../src/ui/layout.ts'
import type { AskDrawn, Frame, LayoutState } from '../../src/ui/layout.ts'
import type { Node } from '../../src/ui/node.ts'
import { drawText } from '../support/draw.ts'
import { componentOf } from '../support/drawn.ts'
import { binnacleTheme, themed } from '../../src/ui/theme.ts'
import { parseNode } from '../../src/ui/node.ts'

const OPEN = { toggled: new Set<string>() }

/** A frame as a person reads it: no styling, no trailing spaces. */
const plain = (frame: Frame): Frame => ({ ...frame, lines: frame.lines.map((line) => stripTerminalSequences(line).trimEnd()) })

test('text wraps at the width, as pi-tui wraps it, and offers nothing', () => {
  assert.deepEqual(plain(layout({ kind: 'text', text: 'the quick brown fox jumps' }, 10, OPEN)), {
    lines: ['the quick', 'brown fox', 'jumps'],
    regions: [],
    focusable: [],
    asks: [],
  })
})

test('a stack draws its children in order, and what offers something is a region over the rows it drew', () => {
  const node = {
    kind: 'stack',
    children: [
      { kind: 'text', text: 'one' },
      {
        kind: 'offer',
        id: 'answer:4',
        affordances: [{ kind: 'copy', label: 'copy the answer' }],
        child: { kind: 'text', text: 'two three' },
      },
    ],
  } as const
  assert.deepEqual(plain(layout(node, 5, OPEN)), {
    lines: ['one', 'two', 'three'],
    regions: [
      {
        region: { id: 'answer:4', affordances: [{ kind: 'copy', label: 'copy the answer' }], overflows: false },
        top: 1,
        height: 2,
        left: 0,
        width: 5,
      },
    ],
    focusable: ['answer:4'],
    asks: [],
  })
})

const long = { kind: 'fold', id: 'tool:c1', rows: 2, child: { kind: 'text', text: 'l1\nl2\nl3\nl4' } } as const

/** A fold of no rows under a muted title, as thinking is drawn. */
const quiet = {
  kind: 'fold',
  id: 'answer:1/reasoning-0',
  rows: 0,
  title: [{ mark: 'thinking' } as const, ' thinking'],
  tone: 'muted',
  child: { kind: 'text', text: 'one\ntwo\nthree\nfour\nfive' },
} as const

test('a closed fold of no rows under its title draws one line: its title and what it holds, and offers expand there', () => {
  assert.deepEqual(drawText(componentOf(quiet, OPEN), 40), ['∴ thinking · 5 lines'])
  assert.deepEqual(layout(quiet, 40, OPEN).regions, [
    {
      region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'show 5 more lines' }], overflows: false },
      top: 0,
      height: 1,
      left: 0,
      width: 40,
    },
  ])
})

test('a focused one says what Enter will do on its own line, its title kept on it in accent', () => {
  const state = { toggled: new Set<string>(), focus: 'answer:1/reasoning-0' }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['▸ ∴ thinking · show 5 more lines'])
  const frame = layout(quiet, 40, state)
  assert.equal(frame.lines[0]?.trimEnd(), '\x1b[36m▸ ∴ thinking · show 5 more lines\x1b[39m')
  assert.deepEqual(
    frame.regions.map(({ region, top, height }) => [region.id, top, height]),
    [['answer:1/reasoning-0', 0, 1]],
  )
  // The row is the fold's own line in its place; at a narrow width it wraps to more rows, as any line does.
  assert.deepEqual(drawText(componentOf(quiet, state), 20), ['▸ ∴ thinking · show', '5 more lines'])
})

test('an opened one draws its content under its title, the title saying it can be folded, and answers on that line alone', () => {
  const state = { toggled: new Set(['answer:1/reasoning-0']) }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['∴ thinking · show less', 'one', 'two', 'three', 'four', 'five'])
  assert.deepEqual(layout(quiet, 40, state).regions, [
    {
      region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'fold it away' }], overflows: false },
      top: 0,
      height: 1,
      left: 0,
      width: 40,
    },
  ])
  // The region is the title's line alone: a click on the content reaches nothing, a click on the title the fold.
  const { regions } = layout(quiet, 40, state)
  assert.deepEqual(
    under(regions, 0, 0).map((region) => region.id),
    ['answer:1/reasoning-0'],
  )
  assert.deepEqual(under(regions, 2, 0), [])
})

test('an open fold whose heading wraps places what it holds beneath the rows it drew, however many', () => {
  const node = {
    kind: 'fold',
    id: 'f',
    rows: 0,
    title: [{ text: 'a title long enough to wrap', tone: 'muted' }],
    child: { kind: 'offer', id: 'held', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'held' } },
  } as const
  const frame = layout(node, 12, { toggled: new Set(['f']) })
  // pi-tui wraps `a title long enough to wrap · show less` at 12 columns onto four rows, the title alone onto three.
  assert.deepEqual(drawText(componentOf(node, { toggled: new Set(['f']) }), 12), [
    'a title long',
    'enough to',
    'wrap · show',
    'less',
    'held',
  ])
  assert.deepEqual(
    frame.regions.map(({ region, top, height }) => [region.id, top, height]),
    [
      ['f', 0, 4],
      ['held', 4, 1],
    ],
  )
})

test('a focused open fold of no rows says what Enter will do on its title line, titled and in accent, and its content follows', () => {
  const state = { toggled: new Set(['answer:1/reasoning-0']), focus: 'answer:1/reasoning-0' }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['▸ ∴ thinking · fold it away', 'one', 'two', 'three', 'four', 'five'])
  const frame = layout(quiet, 40, state)
  assert.equal(frame.lines[0]?.trimEnd(), '\x1b[36m▸ ∴ thinking · fold it away\x1b[39m')
  assert.deepEqual(
    frame.regions.map(({ region, top, height }) => [region.id, top, height]),
    [['answer:1/reasoning-0', 0, 1]],
  )
})

test('a fold that shows rows keeps its marker beneath them, its title above, and is a region over all its rows', () => {
  const node = { ...quiet, rows: 2, child: { kind: 'text', text: 'l1\nl2\nl3\nl4' } } as const
  assert.deepEqual(drawText(componentOf(node, OPEN), 40), ['∴ thinking', 'l1', 'l2', '… 2 more lines'])
  assert.deepEqual(layout(node, 40, OPEN).regions, [
    {
      region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'show 2 more lines' }], overflows: false },
      top: 0,
      height: 4,
      left: 0,
      width: 40,
    },
  ])
})

test('a fold whose content was cut shows its first rows, says what it cut, and offers expand', () => {
  assert.deepEqual(plain(layout(long, 20, OPEN)), {
    lines: ['l1', 'l2', '… 2 more lines'],
    regions: [
      {
        region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'show 2 more lines' }], overflows: false },
        top: 0,
        height: 3,
        left: 0,
        width: 20,
      },
    ],
    focusable: ['tool:c1'],
    asks: [],
  })
})

test('an opened fold shows everything, and expand folds it back', () => {
  assert.deepEqual(plain(layout(long, 20, { toggled: new Set(['tool:c1']) })), {
    lines: ['l1', 'l2', 'l3', 'l4'],
    regions: [
      {
        region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'fold to 2 lines' }], overflows: false },
        top: 0,
        height: 4,
        left: 0,
        width: 20,
      },
    ],
    focusable: ['tool:c1'],
    asks: [],
  })
})

test('a fold whose content fits offers nothing, so no gesture reaches it', () => {
  assert.deepEqual(plain(layout({ ...long, rows: 4 }, 20, OPEN)), { lines: ['l1', 'l2', 'l3', 'l4'], regions: [], focusable: [], asks: [] })
})

test('a titled fold whose content fits draws its title above it, and offers nothing', () => {
  assert.deepEqual(drawText(componentOf({ ...quiet, rows: 1, child: { kind: 'text', text: 'one' } }, OPEN), 40), ['∴ thinking', 'one'])
  assert.deepEqual(layout({ ...quiet, rows: 1, child: { kind: 'text', text: 'one' } }, 40, OPEN).regions, [])
})

test('the row a focused cut fold draws is the accent row saying what Enter will do, so focusing it moves nothing', () => {
  const frame = layout(long, 20, { toggled: new Set(), focus: 'tool:c1' })
  assert.deepEqual(
    frame.lines.map((line) => stripTerminalSequences(line).trimEnd()),
    ['l1', 'l2', '▸ show 2 more lines'],
  )
  assert.equal(frame.lines[2]?.trimEnd(), '\x1b[36m▸ show 2 more lines\x1b[39m')
})

test('a focused open fold draws the accent row under it, saying what Enter will do, and its region covers the row', () => {
  const frame = layout(long, 20, { toggled: new Set(['tool:c1']), focus: 'tool:c1' })
  assert.deepEqual(
    frame.lines.map((line) => stripTerminalSequences(line).trimEnd()),
    ['l1', 'l2', 'l3', 'l4', '▸ fold to 2 lines'],
  )
  assert.equal(frame.lines[4]?.trimEnd(), '\x1b[36m▸ fold to 2 lines\x1b[39m')
  assert.deepEqual(
    frame.regions.map(({ region, top, height }) => [region.id, top, height]),
    [['tool:c1', 0, 5]],
  )
})

test('a focused region that offers, an offer node, draws the same accent row under it', () => {
  const node = {
    kind: 'offer',
    id: 'answer:4',
    affordances: [{ kind: 'copy', label: 'copy the answer' }],
    child: { kind: 'text', text: 'an answer' },
  } as const
  const frame = layout(node, 20, { toggled: new Set(), focus: 'answer:4' })
  assert.deepEqual(
    frame.lines.map((line) => stripTerminalSequences(line).trimEnd()),
    ['an answer', '▸ copy the answer'],
  )
  assert.equal(frame.lines[1]?.trimEnd(), '\x1b[36m▸ copy the answer\x1b[39m')
})

test('a folded region hides the regions it cut, and clips one it cut through', () => {
  const copy = [{ kind: 'copy', label: 'copy' }] as const
  const node = {
    kind: 'fold',
    id: 'f',
    rows: 2,
    child: {
      kind: 'stack',
      children: [
        { kind: 'text', text: 'l1' },
        { kind: 'offer', id: 'through', affordances: copy, child: { kind: 'text', text: 'l2\nl3' } },
        { kind: 'offer', id: 'hidden', affordances: copy, child: { kind: 'text', text: 'l4' } },
      ],
    },
  } as const
  assert.deepEqual(
    plain(layout(node, 20, OPEN)).regions.map(({ region, top, height }) => [region.id, top, height]),
    [
      ['f', 0, 3],
      ['through', 1, 1],
    ],
  )
})

test('the regions under a row are the ones covering it, innermost first', () => {
  const copy = [{ kind: 'copy', label: 'copy' }] as const
  const node = {
    kind: 'offer',
    id: 'outer',
    affordances: copy,
    child: {
      kind: 'stack',
      children: [
        { kind: 'text', text: 'a' },
        { kind: 'offer', id: 'inner', affordances: copy, child: { kind: 'text', text: 'b' } },
      ],
    },
  } as const
  const { regions } = layout(node, 10, OPEN)
  assert.deepEqual(
    under(regions, 1, 0).map((region) => region.id),
    ['inner', 'outer'],
  )
  assert.deepEqual(
    under(regions, 0, 0).map((region) => region.id),
    ['outer'],
  )
  assert.deepEqual(under(regions, 2, 0), [])
})

test('a blank is one empty line, which text cannot be: pi-tui draws nothing for it', () => {
  assert.deepEqual(
    plain(layout({ kind: 'stack', children: [{ kind: 'text', text: 'a' }, { kind: 'blank' }, { kind: 'text', text: 'b' }] }, 10, OPEN))
      .lines,
    ['a', '', 'b'],
  )
})

/** What expand says on an open fold that shows so many rows while folded. */
const label = (rows: number): string | undefined =>
  layout({ ...long, rows }, 20, { toggled: new Set(['tool:c1']) }).regions[0]?.region.affordances[0]?.label

test('an open fold says in words what folding does: away, to one line, or to its lines', () => {
  assert.deepEqual([label(0), label(1), label(2)], ['fold it away', 'fold to 1 line', 'fold to 2 lines'])
})

test("text in a tone opens every line it wraps to in the theme's style for that tone", () => {
  const frame = layout({ kind: 'text', text: 'failed to build', tone: 'error' }, 10, { toggled: new Set() })
  assert.deepEqual(
    frame.lines.map((line) => stripTerminalSequences(line).trimEnd()),
    ['failed to', 'build'],
  )
  for (const line of frame.lines) assert.ok(line.startsWith('\x1b[31m'), JSON.stringify(line))
})

test("a text node of spans draws each span in its own tone, and a bare span in the node's", () => {
  const node = { kind: 'text', text: [{ text: '›', tone: 'accent' }, ' fix the ', { text: 'build', tone: 'dim' }], tone: 'muted' } as const
  assert.deepEqual(
    layout(node, 40, OPEN).lines.map((line) => line.trimEnd()),
    ['\x1b[36m›\x1b[39m\x1b[90m fix the \x1b[39m\x1b[2mbuild\x1b[22m'],
  )
})

test("a span naming a mark draws its glyph, in the mark's tone", () => {
  const node = { kind: 'text', text: [{ mark: 'done' }, ' shipped'] } as const
  assert.deepEqual(
    layout(node, 40, OPEN).lines.map((line) => line.trimEnd()),
    ['\x1b[32m●\x1b[39m shipped'],
  )
})

test("a span naming a mark and a tone draws the mark's glyph in the tone it names", () => {
  const node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' }, ' c9'] } as const
  assert.deepEqual(
    layout(node, 40, OPEN).lines.map((line) => line.trimEnd()),
    ['\x1b[90m●\x1b[39m c9'],
  )
})

test('a mark and the spans beside it in one tone draw as one styled run, as the line always was', () => {
  const node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' }, ' result of call c9'], tone: 'muted' } as const
  assert.deepEqual(
    layout(node, 40, OPEN).lines.map((line) => line.trimEnd()),
    ['\x1b[90m● result of call c9\x1b[39m'],
  )
})

test('a span that wraps keeps its tone on every line it wraps to', () => {
  const node = { kind: 'text', text: ['the build ', { text: 'failed to finish', tone: 'error' }] } as const
  const frame = layout(node, 10, OPEN)
  assert.deepEqual(
    frame.lines.map((line) => stripTerminalSequences(line).trimEnd()),
    ['the build', 'failed to', 'finish'],
  )
  assert.ok(frame.lines[1]?.startsWith('\x1b[31m'), JSON.stringify(frame.lines[1]))
  assert.ok(frame.lines[2]?.startsWith('\x1b[31m'), JSON.stringify(frame.lines[2]))
})

test('an ask draws what it holds inside a rounded border, its title on the top edge', () => {
  assert.deepEqual(plain(layout({ kind: 'ask', title: 'bash', child: { kind: 'text', text: 'exit 0' } }, 20, OPEN)), {
    lines: ['╭─ bash ───────────╮', '│ exit 0           │', '╰──────────────────╯'],
    regions: [],
    focusable: [],
    asks: [{ page: 0, pages: 1, pageRows: 0, window: 0, shown: 0, offers: [] }],
  })
})

test('a theme names the frame an ask is drawn in by one word: square, heavy, double, or none, its edges then blank', () => {
  const ask = { kind: 'ask', title: 'bash', child: { kind: 'text', text: 'exit 0' } } as const
  const drawnIn = (frame: string) => drawText(componentOf(ask, OPEN, themed(binnacleTheme, [{ chrome: { frame } as never }])), 14)
  assert.deepEqual(drawnIn('square'), ['┌─ bash ─────┐', '│ exit 0     │', '└────────────┘'])
  assert.deepEqual(drawnIn('heavy'), ['┏━ bash ━━━━━┓', '┃ exit 0     ┃', '┗━━━━━━━━━━━━┛'])
  assert.deepEqual(drawnIn('double'), ['╔═ bash ═════╗', '║ exit 0     ║', '╚════════════╝'])
  assert.deepEqual(drawnIn('none'), ['   bash', '  exit 0', ''])
  assert.deepEqual(drawnIn('rounded'), ['╭─ bash ─────╮', '│ exit 0     │', '╰────────────╯'])
})

test("an ask is padded inside its border by the theme's spacing, and what it holds is a region where it is drawn", () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'exit 0' } } as const
  const padded = (ask: number) => layout({ kind: 'ask', child: held }, 14, OPEN, themed(binnacleTheme, [{ spacing: { ask } }]))
  const drawn = (ask: number, width: number) =>
    drawText(componentOf({ kind: 'ask', child: held }, OPEN, themed(binnacleTheme, [{ spacing: { ask } }])), width)
  assert.deepEqual(drawn(0, 14), ['╭────────────╮', '│exit 0      │', '╰────────────╯'])
  assert.deepEqual(drawn(3, 14), ['╭────────────╮', '│   exit 0   │', '╰────────────╯'])
  assert.deepEqual(drawn(3, 12), ['╭──────────╮', '│   exit   │', '│   0      │', '╰──────────╯'])
  assert.deepEqual(
    [padded(0), padded(3)].map(({ regions }) => regions.map(({ top, left, width }) => [top, left, width])),
    [[[1, 1, 12]], [[1, 4, 6]]],
  )
})

/**
 * A show of one line titled `t`, drawn in a theme with changes laid over binnacle's.
 * @param changes - the theme's changes.
 * @param width - the width it is drawn at.
 * @param text - what it shows.
 * @returns its lines, as the terminal reads them.
 */
const drawnShow = (changes: Parameters<typeof themed>[1][number], width: number, text = 'out'): string[] =>
  drawText(componentOf({ kind: 'show', title: ['t'], child: { kind: 'text', text } }, OPEN, themed(binnacleTheme, [changes])), width)

test("a show's gutter is the theme's frame's side, as many columns from what it holds as the theme's spacing gives, and what it holds is a region there", () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'out' } } as const
  const shown = (changes: Parameters<typeof themed>[1][number]) =>
    layout({ kind: 'show', title: ['t'], child: held }, 10, OPEN, themed(binnacleTheme, [changes]))
  assert.deepEqual(drawnShow({ chrome: { frame: 'heavy' } }, 10), ['t', '┃ out'])
  assert.deepEqual(drawnShow({ chrome: { frame: 'double' } }, 10), ['t', '║ out'])
  assert.deepEqual(drawnShow({ chrome: { frame: 'none' } }, 10), ['t', '  out'])
  assert.deepEqual(drawnShow({ spacing: { show: 3 } }, 10), ['t', '│   out'])
  assert.deepEqual(drawnShow({ spacing: { show: 3 } }, 10, 'out and more'), ['t', '│   out', '│   and', '│   more'])
  assert.deepEqual(
    [shown({ spacing: { show: 0 } }), shown({ spacing: { show: 3 } })].map(({ regions }) => regions.map(({ top, left }) => [top, left])),
    [[[1, 1]], [[1, 4]]],
  )
})

test('what an ask holds is a region inside its border, by its rows and by its columns', () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'exit 0' } } as const
  const { regions } = layout({ kind: 'ask', child: held }, 20, OPEN)
  assert.deepEqual(
    regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]),
    [['o', 1, 1, 2, 16]],
  )
  assert.deepEqual(
    [0, 1, 2, 17, 18, 19].map((column) => under(regions, 1, column).map((region) => region.id)),
    [[], [], ['o'], ['o'], [], []],
  )
  assert.deepEqual(under(regions, 0, 2), [])
})

test('a title too wide for the top edge is left off whole, never cut', () => {
  assert.deepEqual(plain(layout({ kind: 'ask', title: 'bash', child: { kind: 'text', text: 'ok' } }, 9, OPEN)).lines, [
    '╭───────╮',
    '│ ok    │',
    '╰───────╯',
  ])
})

test('a card with no column inside its border draws what it holds without one', () => {
  assert.deepEqual(plain(layout({ kind: 'ask', title: 'bash', child: { kind: 'text', text: 'ok' } }, 4, OPEN)).lines, ['ok'])
})

test('what a band holds is a region inside its padding, by its rows and by its columns', () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'exit 0' } } as const
  const { regions } = layout({ kind: 'band', background: 'userMessageBg', child: held }, 20, OPEN)
  assert.deepEqual(
    regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]),
    [['o', 1, 1, 1, 18]],
  )
  assert.deepEqual(
    [0, 1, 18, 19].map((column) => under(regions, 1, column).map((region) => region.id)),
    [[], ['o'], ['o'], []],
  )
  assert.deepEqual(under(regions, 0, 1), [])
})

test("a band is padded inside its background by the theme's spacing, in rows and columns alike, and what it holds is a region where it is drawn", () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'ok' } } as const
  const padded = (band: number) =>
    layout({ kind: 'band', background: 'userMessageBg', child: held }, 6, OPEN, themed(binnacleTheme, [{ spacing: { band } }]))
  const drawn = (band: number) =>
    drawText(
      componentOf({ kind: 'band', background: 'userMessageBg', child: held }, OPEN, themed(binnacleTheme, [{ spacing: { band } }])),
      6,
    )
  assert.deepEqual(drawn(0), ['ok'])
  assert.deepEqual(drawn(2), ['', '', '  ok', '', ''])
  assert.deepEqual(
    [padded(0), padded(2)].map(({ regions }) => regions.map(({ top, left }) => [top, left])),
    [[[0, 0]], [[2, 2]]],
  )
})

test('a band with no column inside it draws what it holds without its padding', () => {
  assert.deepEqual(plain(layout({ kind: 'band', background: 'userMessageBg', child: { kind: 'text', text: 'ok' } }, 2, OPEN)).lines, ['ok'])
})

test('a band around what draws nothing draws nothing itself, not empty padding rows', () => {
  assert.deepEqual(plain(layout({ kind: 'band', background: 'userMessageBg', child: { kind: 'stack', children: [] } }, 20, OPEN)).lines, [])
})

/** A document with one of each part, laid out at 20 columns. */
const document = {
  kind: 'markdown',
  text: '## Ship it\n\nRun `pnpm test` first.\n\n- one\n- two\n\n> quoted\n\n```\nx = 1\n```\n\n---',
} as const

test("a markdown block is laid out as a document by pi-tui's component, and offers nothing", () => {
  const frame = layout(document, 20, OPEN)
  assert.deepEqual(plain(frame).lines, [
    'Ship it',
    '',
    'Run pnpm test first.',
    '',
    '- one',
    '- two',
    '',
    '│ quoted',
    '',
    '```',
    '  x = 1',
    '```',
    '',
    '────────────────────',
  ])
  assert.deepEqual(frame.regions, [])
})

test("a document's parts are drawn in the theme's markdown styles", () => {
  const lines = layout(document, 20, OPEN).lines.map((line) => line.trimEnd())
  assert.ok(lines[0]?.startsWith('\x1b[1m'), JSON.stringify(lines[0]))
  assert.equal(lines[2], 'Run \x1b[33mpnpm test\x1b[39m first.')
  assert.equal(lines[4], '\x1b[36m- \x1b[39mone')
  assert.ok(lines[7]?.startsWith('\x1b[2m│ \x1b[22m'), JSON.stringify(lines[7]))
  assert.equal(lines[9], '\x1b[2m```\x1b[22m')
  assert.equal(lines[13], '\x1b[2m' + '─'.repeat(20) + '\x1b[22m')
})

test("a tone an author's theme recolours draws in the colour it names, one of the terminal's sixteen", () => {
  const theme = themed(binnacleTheme, [{ tones: { accent: { color: 'red' }, muted: { color: 'bright-blue', bold: true } } }])
  assert.deepEqual(layout({ kind: 'text', text: 'hi', tone: 'accent' }, 10, { toggled: new Set() }, theme).lines, [
    '\x1b[31mhi\x1b[39m        ',
  ])
  assert.deepEqual(layout({ kind: 'text', text: 'hi', tone: 'muted' }, 10, { toggled: new Set() }, theme).lines, [
    '\x1b[94m\x1b[1mhi\x1b[22m\x1b[39m        ',
  ])
})

test("a band may be filled with a background an author's theme adds, one of the terminal's sixteen", () => {
  const theme = themed(binnacleTheme, [{ backgrounds: { failed: 'red' } }])
  assert.deepEqual(
    layout({ kind: 'band', background: 'failed', child: { kind: 'text', text: 'x' } }, 5, { toggled: new Set() }, theme).lines,
    ['\x1b[41m     \x1b[49m', '\x1b[41m x   \x1b[49m', '\x1b[41m     \x1b[49m'],
  )
})

test("a span may name a mark an author's theme adds, drawn in its glyph and tone", () => {
  const theme = themed(binnacleTheme, [{ marks: { pinned: { glyph: '★', tone: 'warning' } } }])
  assert.deepEqual(layout({ kind: 'text', text: [{ mark: 'pinned' }, ' kept'] }, 8, { toggled: new Set() }, theme).lines, [
    '\x1b[33m★\x1b[39m kept  ',
  ])
})

test("a cut fold says what an author's theme gives the chrome and the words: its glyph, and a template counting the lines", () => {
  const theme = themed(binnacleTheme, [{ chrome: { cut: '+' }, words: { cut: '{n} hidden {lines}' } }])
  const fold = { kind: 'fold', id: 'f', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } } as const
  assert.deepEqual(
    layout(fold, 20, { toggled: new Set() }, theme).lines.map((line) => line.trimEnd()),
    ['a', '+ 2 hidden lines'],
  )
})

/** The keys a table binds: Enter answers what has focus, Tab moves it on, the shift arrows page prose; nothing else is bound. */
const keys = (binding: string): readonly string[] =>
  (
    ({
      primary: ['enter'],
      'focus.next': ['tab'],
      'page.previous': ['shift+up'],
      'page.next': ['shift+down'],
    }) as Readonly<Record<string, readonly string[]>>
  )[binding] ?? []

/** An ask holding two offers, as an approval does. */
const asked = {
  kind: 'ask',
  title: 'run ls?',
  child: {
    kind: 'stack',
    children: [
      { kind: 'offer', id: 'allow', affordances: [{ kind: 'grant', label: 'allow once' }], child: { kind: 'text', text: 'allow once' } },
      { kind: 'offer', id: 'reject', affordances: [{ kind: 'dismiss', label: 'reject' }], child: { kind: 'text', text: 'reject' } },
    ],
  },
} as const

test("a show draws its title, and what it holds beneath it along the theme's gutter", () => {
  assert.deepEqual(plain(layout({ kind: 'show', title: ['bash ls'], child: { kind: 'text', text: 'a\nb' } }, 20, OPEN)).lines, [
    'bash ls',
    '│ a',
    '│ b',
  ])
})

test('what a show holds is a region beside its gutter, below its title, its rows as it wraps', () => {
  const held = {
    kind: 'offer',
    id: 'out',
    affordances: [{ kind: 'copy', label: 'copy' }],
    child: { kind: 'text', text: 'abcd efgh' },
  } as const
  const frame = layout({ kind: 'show', title: ['bash'], child: held }, 8, OPEN)
  assert.deepEqual(plain(frame).lines, ['bash', '│ abcd', '│ efgh'])
  assert.deepEqual(
    frame.regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]),
    [['out', 1, 2, 2, 6]],
  )
  assert.deepEqual(
    [0, 1, 2, 7].map((column) => under(frame.regions, 2, column).map((region) => region.id)),
    [[], [], ['out'], ['out']],
  )
})

test('an ask names on its bottom edge the keys that answer what it holds, as the key table binds them', () => {
  assert.equal(plain(layout(asked, 30, { ...OPEN, keys })).lines.at(-1), '╰─ enter select · tab next ──╯')
})

/** An ask holding twenty offers of one row each, as a long list to choose from is drawn. */
const twenty = {
  kind: 'ask',
  title: 'pick',
  child: {
    kind: 'stack',
    children: Array.from({ length: 20 }, (_, at): Node => ({
      kind: 'offer',
      id: `o${at + 1}`,
      affordances: [{ kind: 'choose', label: `option ${at + 1}` }],
      child: { kind: 'text', text: `option ${at + 1}` },
    })),
  },
} as const

test('an ask whose offers are taller than its room keeps its edges, windows whole offers holding the focused one, and says where it is on the bottom edge', () => {
  const frame = layout(twenty, 30, { toggled: new Set<string>(), focus: 'o7', room: 8 })
  assert.deepEqual(plain(frame).lines, [
    `╭─ pick ${'─'.repeat(21)}╮`,
    '│ option 3                   │',
    '│ option 4                   │',
    '│ option 5                   │',
    '│ option 6                   │',
    '│ option 7                   │',
    '│ ▸ option 7                 │',
    `╰─ 7/20 ${'─'.repeat(21)}╯`,
  ])
  assert.deepEqual(
    frame.regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]),
    [
      ['o3', 1, 1, 2, 26],
      ['o4', 2, 1, 2, 26],
      ['o5', 3, 1, 2, 26],
      ['o6', 4, 1, 2, 26],
      ['o7', 5, 2, 2, 26],
    ],
  )
  // Every offer is focusable, the windowed away included, so focus can reach them.
  assert.deepEqual(
    frame.focusable,
    Array.from({ length: 20 }, (_, at) => `o${at + 1}`),
  )
  assert.deepEqual(frame.asks, [
    { page: 0, pages: 1, pageRows: 0, window: 2, shown: 5, offers: Array.from({ length: 20 }, (_, at) => `o${at + 1}`) },
  ])
})

/** The twenty offers as the ask reports them, in order. */
const twentyOffers = Array.from({ length: 20 }, (_, at) => `o${at + 1}`)

/** The one ask a frame holds, as the ask reports where its window stands. */
const askOf = (frame: Frame): AskDrawn => {
  const [ask] = frame.asks
  assert.ok(ask !== undefined, 'the ask reports where its window stands')
  return ask
}

/** The twenty offers' ask drawn at a room of eight rows, in a state a test fills in. */
const inRoomEight = (state: {
  readonly focus?: string
  readonly asks?: readonly ({ page: number; window: number } | undefined)[]
}): Frame => layout(twenty, 30, { toggled: new Set<string>(), ...state, room: 8 })

test("moving focus past the window's end brings the next offer in, and the window moves no further than it must", () => {
  const drawn = inRoomEight
  const offers = twentyOffers
  // With nothing focused the window starts where the state says: at its first offer.
  assert.deepEqual(drawn({}).asks, [{ page: 0, pages: 1, pageRows: 0, window: 0, shown: 6, offers }])
  assert.deepEqual(askOf(drawn({ focus: 'o8' })), { page: 0, pages: 1, pageRows: 0, window: 3, shown: 5, offers })
  assert.deepEqual(plain(drawn({ focus: 'o8' })).lines.slice(1, -1), [
    '│ option 4                   │',
    '│ option 5                   │',
    '│ option 6                   │',
    '│ option 7                   │',
    '│ option 8                   │',
    '│ ▸ option 8                 │',
  ])
  // Focus moving inside the window moves nothing; focus above it brings the window up to the offer.
  assert.equal(askOf(drawn({ focus: 'o6', asks: [{ page: 0, window: 3 }] })).window, 3)
  assert.equal(askOf(drawn({ focus: 'o2', asks: [{ page: 0, window: 3 }] })).window, 1)
})

/** An ask holding six rows of prose over three offers of one row each, as a long plan review is drawn. */
const longAsked = {
  kind: 'ask',
  title: 'plan',
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
} as const

/** One row of an ask drawn at 60 columns. */
const wideRow = (text: string): string => `│ ${text}${' '.repeat(57 - text.length)}│`

test('an ask whose prose is taller than its room pages the prose, keeps its offers and edges drawn, and says which page it is on', () => {
  const frame = layout(longAsked, 60, { toggled: new Set<string>(), room: 10, keys })
  assert.deepEqual(plain(frame).lines, [
    `╭─ plan ${'─'.repeat(51)}╮`,
    wideRow('p1'),
    wideRow('p2'),
    wideRow('p3'),
    wideRow('p4'),
    wideRow('page 1/2'),
    wideRow('one'),
    wideRow('two'),
    wideRow('three'),
    `╰─ enter select · tab next · shift+up/shift+down page ${'─'.repeat(5)}╯`,
  ])
  assert.deepEqual(frame.asks, [{ page: 0, pages: 2, pageRows: 4, window: 0, shown: 3, offers: ['o1', 'o2', 'o3'] }])
})

test('the next page of the prose keeps one row of the last, and the position row moves under it', () => {
  const frame = layout(longAsked, 60, { toggled: new Set<string>(), room: 10, keys, asks: [{ page: 3, window: 0 }] })
  assert.deepEqual(plain(frame).lines.slice(1, -1), [
    wideRow('p4'),
    wideRow('p5'),
    wideRow('p6'),
    wideRow('page 2/2'),
    wideRow(''),
    wideRow('one'),
    wideRow('two'),
    wideRow('three'),
  ])
  assert.deepEqual(frame.asks, [{ page: 3, pages: 2, pageRows: 4, window: 0, shown: 3, offers: ['o1', 'o2', 'o3'] }])
})

test("the theme's asks.rows makes every ask a box of that height, padded inside when what it holds is shorter", () => {
  const theme = themed(binnacleTheme, [{ asks: { rows: 6 } }])
  assert.deepEqual(plain(layout({ kind: 'ask', title: 'pick', child: { kind: 'text', text: 'one' } }, 12, OPEN, theme)).lines, [
    '╭─ pick ───╮',
    '│ one      │',
    '│          │',
    '│          │',
    '│          │',
    '╰──────────╯',
  ])
  assert.deepEqual(layout({ kind: 'ask', title: 'pick', child: { kind: 'text', text: 'one' } }, 12, OPEN, theme).asks, [
    { page: 0, pages: 1, pageRows: 0, window: 0, shown: 0, offers: [] },
  ])
})

test('an ask naming its own rows is drawn at that height, whatever the theme gives every ask', () => {
  const theme = themed(binnacleTheme, [{ asks: { rows: 8 } }])
  const ask = parseNode({ kind: 'ask', title: 'pick', rows: 5, child: { kind: 'text', text: 'one' } }, theme)
  assert.deepEqual(plain(layout(ask, 12, OPEN, theme)).lines, [
    '╭─ pick ───╮',
    '│ one      │',
    '│          │',
    '│          │',
    '╰──────────╯',
  ])
})

test("an ask's position words are the theme's, wherever it says where it is: the window on the edge, the page beneath the prose", () => {
  const theme = themed(binnacleTheme, [{ words: { page: 'pg', 'offer.at': '{count} of {of}', 'page.at': 'pg {count}/{of}' } }])
  assert.equal(plain(layout(twenty, 30, { toggled: new Set<string>(), room: 8 }, theme)).lines.at(-1), `╰─ 1 of 20 ${'─'.repeat(18)}╯`)
  const paged = layout(longAsked, 60, { toggled: new Set<string>(), room: 10, keys }, theme)
  assert.equal(plain(paged).lines[5], `│ pg 1/2${' '.repeat(51)}│`)
  assert.equal(plain(paged).lines.at(-1), `╰─ enter select · tab next · shift+up/shift+down pg ${'─'.repeat(7)}╯`)
})

test('an ask below the root of what is drawn has no room of it, and an ask of its own rows is windowed where it sits', () => {
  const node: Node = {
    kind: 'stack',
    children: [
      { kind: 'text', text: 'before' },
      { ...twenty, rows: 7, title: 'pick' },
    ],
  }
  const frame = layout(node, 30, { toggled: new Set<string>(), room: 24 })
  assert.deepEqual(plain(frame).lines, [
    'before',
    `╭─ pick ${'─'.repeat(21)}╮`,
    '│ option 1                   │',
    '│ option 2                   │',
    '│ option 3                   │',
    '│ option 4                   │',
    '│ option 5                   │',
    `╰─ 1/20 ${'─'.repeat(21)}╯`,
  ])
  assert.deepEqual(frame.asks, [{ page: 0, pages: 1, pageRows: 0, window: 0, shown: 5, offers: twentyOffers }])
})

/** An ask of `prose` one-row prose lines over three one-row offers, as a plan review is drawn. */
const proseOver = (prose: number): Node => ({
  kind: 'ask',
  title: 'plan',
  child: {
    kind: 'stack',
    children: [
      ...Array.from({ length: prose }, (_, row): Node => ({ kind: 'text', text: `p${row + 1}` })),
      ...(['one', 'two', 'three'] as const).map((text, at): Node => ({
        kind: 'offer',
        id: `o${at + 1}`,
        affordances: [{ kind: 'choose', label: `option ${at + 1}` }],
        child: { kind: 'text', text },
      })),
    ],
  },
})

test('prose that the last full page finishes pages into no further page', () => {
  // Seven prose rows, four a page, stepping three: pages one and two (from row four) hold it all.
  const frame = layout(proseOver(7), 60, { toggled: new Set<string>(), room: 10, keys })
  assert.deepEqual(frame.asks, [{ page: 0, pages: 2, pageRows: 4, window: 0, shown: 3, offers: ['o1', 'o2', 'o3'] }])
  // A page held beyond the last is clamped onto it, not onto a page of one row.
  const clamped = layout(proseOver(7), 60, { toggled: new Set<string>(), room: 10, keys, asks: [{ page: 6, window: 0 }] })
  assert.deepEqual(clamped.asks, [{ page: 3, pages: 2, pageRows: 4, window: 0, shown: 3, offers: ['o1', 'o2', 'o3'] }])
  assert.deepEqual(
    plain(clamped)
      .lines.slice(1, 5)
      .map((line) => line.slice(2, -1).trimEnd()),
    ['p4', 'p5', 'p6', 'p7'],
  )
})

test('the window moves no further than it must among offers of unequal rows, wrapped ones among them', () => {
  const unequal: Node = {
    kind: 'ask',
    title: 'pick',
    child: {
      kind: 'stack',
      children: [
        { kind: 'offer', id: 'a', affordances: [{ kind: 'choose', label: 'a' }], child: { kind: 'text', text: 'a\na\na\na' } },
        { kind: 'offer', id: 'b', affordances: [{ kind: 'choose', label: 'b' }], child: { kind: 'text', text: 'b' } },
        { kind: 'offer', id: 'c', affordances: [{ kind: 'choose', label: 'c' }], child: { kind: 'text', text: 'c c c c c c c c c c' } },
      ],
    },
  }
  const frame = layout(unequal, 20, { toggled: new Set<string>(), focus: 'c', room: 6 })
  assert.deepEqual(frame.asks, [{ page: 0, pages: 1, pageRows: 0, window: 1, shown: 2, offers: ['a', 'b', 'c'] }])
  assert.deepEqual(plain(frame).lines, [
    `╭─ pick ${'─'.repeat(11)}╮`,
    '│ b                │',
    '│ c c c c c c c c  │',
    '│ c c              │',
    '│ ▸ c              │',
    '╰─ 3/3 ────────────╯',
  ])
  assert.deepEqual(
    frame.regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]),
    [
      ['b', 1, 1, 2, 16],
      ['c', 2, 3, 2, 16],
    ],
  )
})

test('only what is drawn and offers something is focusable: not an offer that offers nothing, not what a fold holds away', () => {
  assert.deepEqual(layout({ kind: 'offer', id: 'none', affordances: [], child: { kind: 'text', text: 'plain' } }, 30, OPEN).focusable, [])
  const folded: Node = {
    kind: 'fold',
    id: 'f',
    rows: 0,
    child: { kind: 'offer', id: 'hidden', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'held' } },
  }
  assert.deepEqual(layout(folded, 30, OPEN).focusable, ['f'])
  const opened = layout(folded, 30, { toggled: new Set(['f']) })
  assert.deepEqual(opened.focusable, ['f', 'hidden'], 'opened, what it holds is drawn and focusable again')
  // A fold that shows rows keeps focusable what its rows show, and drops what it cut.
  const below: Node = { ...(folded.child as Extract<Node, { readonly kind: 'offer' }>), id: 'below' }
  const cut: Node = { ...folded, rows: 1, child: { kind: 'stack', children: [{ kind: 'text', text: 'shown' }, below] } }
  assert.deepEqual(layout(cut, 30, OPEN).focusable, ['f'], 'the offer beneath the rows it shows is held away')
})

test('the bottom edge keeps the tail of its hint that fits, so where the ask is and what pages it outlive the well-known keys', () => {
  const drawnAt = (width: number, state: LayoutState): readonly string[] => drawText(componentOf(oneOffer, state), width)
  // At thirty columns the whole hint cannot fit; the paging keys are kept and the select hint dropped.
  const oneOffer: Node = {
    kind: 'ask',
    title: 'plan',
    child: {
      kind: 'stack',
      children: [
        ...Array.from({ length: 10 }, (_, row): Node => ({ kind: 'text', text: `p${row + 1}` })),
        { kind: 'offer', id: 'yes', affordances: [{ kind: 'choose', label: 'yes' }], child: { kind: 'text', text: 'yes' } },
      ],
    },
  }
  assert.equal(drawnAt(30, { ...OPEN, room: 8, keys }).at(-1), `╰─ shift+up/shift+down page ${'─'.repeat(1)}╯`)
  // And a windowed ask keeps its position, dropping the select hint before it.
  assert.equal(drawText(componentOf(twenty, { ...OPEN, focus: 'o7', room: 8, keys }), 35).at(-1), `╰─ tab next · 7/20 ${'─'.repeat(15)}╯`)
})

test('a position word too wide for the ask is left off whole, never drawn over its edge', () => {
  const seventy: Node = {
    kind: 'ask',
    title: 'plan',
    child: { kind: 'stack', children: Array.from({ length: 70 }, (_, row): Node => ({ kind: 'text', text: `p${row + 1}` })) },
  }
  // At twelve columns the word `page 1/18` cannot fit the eight inside the border; the row stays, the word goes.
  assert.deepEqual(drawText(componentOf(seventy, { ...OPEN, room: 8 }), 12), [
    '╭─ plan ───╮',
    '│ p1       │',
    '│ p2       │',
    '│ p3       │',
    '│ p4       │',
    '│ p5       │',
    '│          │',
    '╰──────────╯',
  ])
  assert.equal(
    layout(seventy, 12, { ...OPEN, room: 8 }).asks[0]?.pages,
    18,
    'the prose still pages, and the ask still says where it is to the pane',
  )
})

test("a card may be filled with a background and edged in a tone, both the theme's, every line of it filled", () => {
  const card = { kind: 'ask', background: 'userMessageBg', edge: 'accent', child: { kind: 'text', text: 'x' } } as const
  assert.deepEqual(layout(card, 6, { toggled: new Set() }).lines, [
    '\x1b[100m\x1b[36m╭────╮\x1b[39m\x1b[49m',
    '\x1b[100m\x1b[36m│\x1b[39m x  \x1b[36m│\x1b[39m\x1b[49m',
    '\x1b[100m\x1b[36m╰────╯\x1b[39m\x1b[49m',
  ])
})

test("a filled card stays filled around what it holds that is filled otherwise: every cell after an inner fill ends is the card's again", () => {
  const theme = themed(binnacleTheme, [{ backgrounds: { failed: 'red' } }])
  const card = {
    kind: 'ask',
    background: 'failed',
    child: { kind: 'band', background: 'userMessageBg', child: { kind: 'text', text: 'x' } },
  } as const
  for (const line of layout(card, 9, { toggled: new Set() }, theme).lines) {
    const inner = line.slice(0, -'\x1b[49m'.length)
    assert.equal(
      inner
        .split('\x1b[49m')
        .slice(1)
        .every((rest) => rest.startsWith('\x1b[41m')),
      true,
      JSON.stringify(line),
    )
  }
})

/**
 * A line saying the time since a moment a second in, laid out at a time.
 * @param now - the time.
 * @returns the line, plain.
 */
const since = (now: number): string =>
  stripTerminalSequences(
    layout({ kind: 'text', text: ['running ', { since: 1_000 }] }, 40, { toggled: new Set(), now }).lines[0] ?? '',
  ).trimEnd()

test('a span that says the time since a moment is laid out at the time it is given: seconds, then minutes and seconds, then hours and minutes', () => {
  assert.equal(since(1_000), 'running 0s')
  assert.equal(since(5_400), 'running 4s')
  assert.equal(since(66_000), 'running 1m 05s')
  assert.equal(since(1_000 + 3_723_000), 'running 1h 02m')
})

test("an offer that names no label says what it does in the theme's words for its kind, as a person changes them", () => {
  const unlabelled = { kind: 'offer', id: 'allow', affordances: [{ kind: 'grant' }], child: { kind: 'text', text: 'allow once' } } as const
  assert.deepEqual(plain(layout(unlabelled, 30, { toggled: new Set(), focus: 'allow' })).lines, ['allow once', '▸ allow'])
  const renamed = themed(binnacleTheme, [{ words: { 'offer.grant': 'yes' } }])
  assert.deepEqual(plain(layout(unlabelled, 30, { toggled: new Set(), focus: 'allow' }, renamed)).lines, ['allow once', '▸ yes'])
})

/**
 * A line saying the time until a moment ten seconds in, laid out at a time.
 * @param now - the time, in Unix epoch milliseconds.
 * @returns the line, plain.
 */
const until = (now: number): string =>
  stripTerminalSequences(
    layout({ kind: 'text', text: ['in ', { until: 10_000 }] }, 40, { toggled: new Set(), now }).lines[0] ?? '',
  ).trimEnd()

test('a span that says the time until a moment counts down to it at the time it is given, and stays at none once it has passed', () => {
  assert.equal(until(6_000), 'in 4s')
  assert.equal(until(9_500), 'in 0s')
  assert.equal(until(12_000), 'in 0s')
})

test('a show that opens a fold it holds answers on its head for that fold, folded or open, and its content answers nothing', () => {
  const card: Node = {
    kind: 'show',
    title: ['● pnpm test'],
    opens: 'output',
    child: { kind: 'fold', id: 'output', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } },
  }
  for (const toggled of [new Set<string>(), new Set(['output'])]) {
    const frame = layout(card, 40, { toggled })
    assert.deepEqual(
      under(frame.regions, 0, 3).map((region) => region.id),
      ['output'],
      [...toggled].join(),
    )
    for (let row = 1; row < frame.lines.length; row++)
      assert.deepEqual(
        under(frame.regions, row, 3).filter((region) => region.affordances.length > 0),
        [],
        `row ${row} ${[...toggled].join()}`,
      )
    assert.deepEqual(
      extent(frame.regions, 'output'),
      { top: 0, height: frame.lines.length },
      'focus brings the fold into view with its head',
    )
  }
})

test('whatever a show opens answers only on its head, however many folds its content names alike', () => {
  const fold: Node = { kind: 'fold', id: 'output', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } }
  const frame = layout({ kind: 'show', title: ['● twice'], opens: 'output', child: { kind: 'stack', children: [fold, fold] } }, 40, {
    toggled: new Set(),
  })
  for (let row = 1; row < frame.lines.length; row++)
    assert.deepEqual(
      under(frame.regions, row, 3).filter((region) => region.affordances.length > 0),
      [],
      `row ${row}`,
    )
})

test('a show that opens a fold offers to copy on its head, after expand, all it holds as text, what is folded away included', () => {
  const card: Node = {
    kind: 'show',
    title: ['● pnpm test'],
    opens: 'output',
    child: {
      kind: 'stack',
      children: [
        { kind: 'text', text: ['exited ', { text: '2', tone: 'error' }] },
        { kind: 'fold', id: 'output', rows: 1, child: { kind: 'markdown', text: 'a\nb\nc' } },
      ],
    },
  }
  const head = under(layout(card, 40, { toggled: new Set() }).regions, 0, 3)[0]
  assert.deepEqual(
    head?.affordances.map((offer) => offer.kind),
    ['expand', 'copy'],
  )
  assert.equal(head?.text, 'exited 2\na\nb\nc')
})
