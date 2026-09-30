import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { layout, under } from '../../src/ui/layout.ts'
import type { Frame } from '../../src/ui/layout.ts'
import { drawText } from '../support/draw.ts'
import { componentOf } from '../support/drawn.ts'
import { binnacleTheme, themed } from '../../src/ui/theme.ts'

const OPEN = { toggled: new Set<string>() }

/** A frame as a person reads it: no styling, no trailing spaces. */
const plain = (frame: Frame): Frame => ({ ...frame, lines: frame.lines.map(line => stripTerminalSequences(line).trimEnd()) })

test('text wraps at the width, as pi-tui wraps it, and offers nothing', () => {
  assert.deepEqual(plain(layout({ kind: 'text', text: 'the quick brown fox jumps' }, 10, OPEN)), { lines: ['the quick', 'brown fox', 'jumps'], regions: [] })
})

test('a stack draws its children in order, and what offers something is a region over the rows it drew', () => {
  const node = {
    kind: 'stack',
    children: [
      { kind: 'text', text: 'one' },
      { kind: 'offer', id: 'answer:4', affordances: [{ kind: 'copy', label: 'copy the answer' }], child: { kind: 'text', text: 'two three' } },
    ],
  } as const
  assert.deepEqual(plain(layout(node, 5, OPEN)), {
    lines: ['one', 'two', 'three'],
    regions: [{ region: { id: 'answer:4', affordances: [{ kind: 'copy', label: 'copy the answer' }], overflows: false }, top: 1, height: 2, left: 0, width: 5 }],
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
  assert.deepEqual(layout(quiet, 40, OPEN).regions, [{ region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'show 5 more lines' }], overflows: false }, top: 0, height: 1, left: 0, width: 40 }])
})

test('a focused one says what Enter will do on its own line, its title kept on it in accent', () => {
  const state = { toggled: new Set<string>(), focus: 'answer:1/reasoning-0' }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['▸ ∴ thinking · show 5 more lines'])
  const frame = layout(quiet, 40, state)
  assert.equal(frame.lines[0]?.trimEnd(), '\x1b[36m▸ ∴ thinking · show 5 more lines\x1b[39m')
  assert.deepEqual(frame.regions.map(({ region, top, height }) => [region.id, top, height]), [['answer:1/reasoning-0', 0, 1]])
  // The row is the fold's own line in its place; at a narrow width it wraps to more rows, as any line does.
  assert.deepEqual(drawText(componentOf(quiet, state), 20), ['▸ ∴ thinking · show', '5 more lines'])
})

test('an opened one draws its content under its title, the title saying it can be folded, and answers on that line alone', () => {
  const state = { toggled: new Set(['answer:1/reasoning-0']) }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['∴ thinking · show less', 'one', 'two', 'three', 'four', 'five'])
  assert.deepEqual(layout(quiet, 40, state).regions, [{ region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'fold it away' }], overflows: false }, top: 0, height: 1, left: 0, width: 40 }])
  // The region is the title's line alone: a click on the content reaches nothing, a click on the title the fold.
  const { regions } = layout(quiet, 40, state)
  assert.deepEqual(under(regions, 0, 0).map(region => region.id), ['answer:1/reasoning-0'])
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
  assert.deepEqual(drawText(componentOf(node, { toggled: new Set(['f']) }), 12), ['a title long', 'enough to', 'wrap · show', 'less', 'held'])
  assert.deepEqual(frame.regions.map(({ region, top, height }) => [region.id, top, height]), [['f', 0, 4], ['held', 4, 1]])
})

test('a focused open fold of no rows says what Enter will do on its title line, titled and in accent, and its content follows', () => {
  const state = { toggled: new Set(['answer:1/reasoning-0']), focus: 'answer:1/reasoning-0' }
  assert.deepEqual(drawText(componentOf(quiet, state), 40), ['▸ ∴ thinking · fold it away', 'one', 'two', 'three', 'four', 'five'])
  const frame = layout(quiet, 40, state)
  assert.equal(frame.lines[0]?.trimEnd(), '\x1b[36m▸ ∴ thinking · fold it away\x1b[39m')
  assert.deepEqual(frame.regions.map(({ region, top, height }) => [region.id, top, height]), [['answer:1/reasoning-0', 0, 1]])
})

test('a fold that shows rows keeps its marker beneath them, its title above, and is a region over all its rows', () => {
  const node = { ...quiet, rows: 2, child: { kind: 'text', text: 'l1\nl2\nl3\nl4' } } as const
  assert.deepEqual(drawText(componentOf(node, OPEN), 40), ['∴ thinking', 'l1', 'l2', '… 2 more lines'])
  assert.deepEqual(layout(node, 40, OPEN).regions, [{ region: { id: 'answer:1/reasoning-0', affordances: [{ kind: 'expand', label: 'show 2 more lines' }], overflows: false }, top: 0, height: 4, left: 0, width: 40 }])
})

test('a fold whose content was cut shows its first rows, says what it cut, and offers expand', () => {
  assert.deepEqual(plain(layout(long, 20, OPEN)), {
    lines: ['l1', 'l2', '… 2 more lines'],
    regions: [{ region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'show 2 more lines' }], overflows: false }, top: 0, height: 3, left: 0, width: 20 }],
  })
})

test('an opened fold shows everything, and expand folds it back', () => {
  assert.deepEqual(plain(layout(long, 20, { toggled: new Set(['tool:c1']) })), {
    lines: ['l1', 'l2', 'l3', 'l4'],
    regions: [{ region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'fold to 2 lines' }], overflows: false }, top: 0, height: 4, left: 0, width: 20 }],
  })
})

test('a fold whose content fits offers nothing, so no gesture reaches it', () => {
  assert.deepEqual(plain(layout({ ...long, rows: 4 }, 20, OPEN)), { lines: ['l1', 'l2', 'l3', 'l4'], regions: [] })
})

test('a titled fold whose content fits draws its title above it, and offers nothing', () => {
  assert.deepEqual(drawText(componentOf({ ...quiet, rows: 1, child: { kind: 'text', text: 'one' } }, OPEN), 40), ['∴ thinking', 'one'])
  assert.deepEqual(layout({ ...quiet, rows: 1, child: { kind: 'text', text: 'one' } }, 40, OPEN).regions, [])
})

test('the row a focused cut fold draws is the accent row saying what Enter will do, so focusing it moves nothing', () => {
  const frame = layout(long, 20, { toggled: new Set(), focus: 'tool:c1' })
  assert.deepEqual(frame.lines.map(line => stripTerminalSequences(line).trimEnd()), ['l1', 'l2', '▸ show 2 more lines'])
  assert.equal(frame.lines[2]?.trimEnd(), '\x1b[36m▸ show 2 more lines\x1b[39m')
})

test('a focused open fold draws the accent row under it, saying what Enter will do, and its region covers the row', () => {
  const frame = layout(long, 20, { toggled: new Set(['tool:c1']), focus: 'tool:c1' })
  assert.deepEqual(frame.lines.map(line => stripTerminalSequences(line).trimEnd()), ['l1', 'l2', 'l3', 'l4', '▸ fold to 2 lines'])
  assert.equal(frame.lines[4]?.trimEnd(), '\x1b[36m▸ fold to 2 lines\x1b[39m')
  assert.deepEqual(frame.regions.map(({ region, top, height }) => [region.id, top, height]), [['tool:c1', 0, 5]])
})

test('a focused region that offers, an offer node, draws the same accent row under it', () => {
  const node = { kind: 'offer', id: 'answer:4', affordances: [{ kind: 'copy', label: 'copy the answer' }], child: { kind: 'text', text: 'an answer' } } as const
  const frame = layout(node, 20, { toggled: new Set(), focus: 'answer:4' })
  assert.deepEqual(frame.lines.map(line => stripTerminalSequences(line).trimEnd()), ['an answer', '▸ copy the answer'])
  assert.equal(frame.lines[1]?.trimEnd(), '\x1b[36m▸ copy the answer\x1b[39m')
})

test('a folded region hides the regions it cut, and clips one it cut through', () => {
  const copy = [{ kind: 'copy', label: 'copy' }] as const
  const node = {
    kind: 'fold', id: 'f', rows: 2, child: {
      kind: 'stack', children: [
        { kind: 'text', text: 'l1' },
        { kind: 'offer', id: 'through', affordances: copy, child: { kind: 'text', text: 'l2\nl3' } },
        { kind: 'offer', id: 'hidden', affordances: copy, child: { kind: 'text', text: 'l4' } },
      ],
    },
  } as const
  assert.deepEqual(plain(layout(node, 20, OPEN)).regions.map(({ region, top, height }) => [region.id, top, height]), [['f', 0, 3], ['through', 1, 1]])
})

test('the regions under a row are the ones covering it, innermost first', () => {
  const copy = [{ kind: 'copy', label: 'copy' }] as const
  const node = {
    kind: 'offer', id: 'outer', affordances: copy, child: {
      kind: 'stack', children: [{ kind: 'text', text: 'a' }, { kind: 'offer', id: 'inner', affordances: copy, child: { kind: 'text', text: 'b' } }],
    },
  } as const
  const { regions } = layout(node, 10, OPEN)
  assert.deepEqual(under(regions, 1, 0).map(region => region.id), ['inner', 'outer'])
  assert.deepEqual(under(regions, 0, 0).map(region => region.id), ['outer'])
  assert.deepEqual(under(regions, 2, 0), [])
})

test('a blank is one empty line, which text cannot be: pi-tui draws nothing for it', () => {
  assert.deepEqual(plain(layout({ kind: 'stack', children: [{ kind: 'text', text: 'a' }, { kind: 'blank' }, { kind: 'text', text: 'b' }] }, 10, OPEN)).lines, ['a', '', 'b'])
})

/** What expand says on an open fold that shows so many rows while folded. */
const label = (rows: number): string | undefined =>
  layout({ ...long, rows }, 20, { toggled: new Set(['tool:c1']) }).regions[0]?.region.affordances[0]?.label

test('an open fold says in words what folding does: away, to one line, or to its lines', () => {
  assert.deepEqual([label(0), label(1), label(2)], ['fold it away', 'fold to 1 line', 'fold to 2 lines'])
})

test('text in a tone opens every line it wraps to in the theme\'s style for that tone', () => {
  const frame = layout({ kind: 'text', text: 'failed to build', tone: 'error' }, 10, { toggled: new Set() })
  assert.deepEqual(frame.lines.map(line => stripTerminalSequences(line).trimEnd()), ['failed to', 'build'])
  for (const line of frame.lines) assert.ok(line.startsWith('\x1b[31m'), JSON.stringify(line))
})

test('a text node of spans draws each span in its own tone, and a bare span in the node\'s', () => {
  const node = { kind: 'text', text: [{ text: '›', tone: 'accent' }, ' fix the ', { text: 'build', tone: 'dim' }], tone: 'muted' } as const
  assert.deepEqual(layout(node, 40, OPEN).lines.map(line => line.trimEnd()), ['\x1b[36m›\x1b[39m\x1b[90m fix the \x1b[39m\x1b[2mbuild\x1b[22m'])
})

test('a span naming a mark draws its glyph, in the mark\'s tone', () => {
  const node = { kind: 'text', text: [{ mark: 'done' }, ' shipped'] } as const
  assert.deepEqual(layout(node, 40, OPEN).lines.map(line => line.trimEnd()), ['\x1b[32m●\x1b[39m shipped'])
})

test('a span naming a mark and a tone draws the mark\'s glyph in the tone it names', () => {
  const node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' }, ' c9'] } as const
  assert.deepEqual(layout(node, 40, OPEN).lines.map(line => line.trimEnd()), ['\x1b[90m●\x1b[39m c9'])
})

test('a mark and the spans beside it in one tone draw as one styled run, as the line always was', () => {
  const node = { kind: 'text', text: [{ mark: 'done', tone: 'muted' }, ' result of call c9'], tone: 'muted' } as const
  assert.deepEqual(layout(node, 40, OPEN).lines.map(line => line.trimEnd()), ['\x1b[90m● result of call c9\x1b[39m'])
})

test('a span that wraps keeps its tone on every line it wraps to', () => {
  const node = { kind: 'text', text: ['the build ', { text: 'failed to finish', tone: 'error' }] } as const
  const frame = layout(node, 10, OPEN)
  assert.deepEqual(frame.lines.map(line => stripTerminalSequences(line).trimEnd()), ['the build', 'failed to', 'finish'])
  assert.ok(frame.lines[1]?.startsWith('\x1b[31m'), JSON.stringify(frame.lines[1]))
  assert.ok(frame.lines[2]?.startsWith('\x1b[31m'), JSON.stringify(frame.lines[2]))
})

test('a card draws what it holds inside a rounded border, its title on the top edge', () => {
  assert.deepEqual(plain(layout({ kind: 'card', title: 'bash', child: { kind: 'text', text: 'exit 0' } }, 20, OPEN)), {
    lines: ['╭─ bash ───────────╮', '│ exit 0           │', '╰──────────────────╯'],
    regions: [],
  })
})

test('what a card holds is a region inside its border, by its rows and by its columns', () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'exit 0' } } as const
  const { regions } = layout({ kind: 'card', child: held }, 20, OPEN)
  assert.deepEqual(regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]), [['o', 1, 1, 2, 16]])
  assert.deepEqual([0, 1, 2, 17, 18, 19].map(column => under(regions, 1, column).map(region => region.id)), [[], [], ['o'], ['o'], [], []])
  assert.deepEqual(under(regions, 0, 2), [])
})

test('a title too wide for the top edge is left off whole, never cut', () => {
  assert.deepEqual(plain(layout({ kind: 'card', title: 'bash', child: { kind: 'text', text: 'ok' } }, 9, OPEN)).lines, ['╭───────╮', '│ ok    │', '╰───────╯'])
})

test('a card with no column inside its border draws what it holds without one', () => {
  assert.deepEqual(plain(layout({ kind: 'card', title: 'bash', child: { kind: 'text', text: 'ok' } }, 4, OPEN)).lines, ['ok'])
})

test('what a band holds is a region inside its padding, by its rows and by its columns', () => {
  const held = { kind: 'offer', id: 'o', affordances: [{ kind: 'copy', label: 'copy' }], child: { kind: 'text', text: 'exit 0' } } as const
  const { regions } = layout({ kind: 'band', background: 'prompt', child: held }, 20, OPEN)
  assert.deepEqual(regions.map(({ region, top, height, left, width }) => [region.id, top, height, left, width]), [['o', 1, 1, 1, 18]])
  assert.deepEqual([0, 1, 18, 19].map(column => under(regions, 1, column).map(region => region.id)), [[], ['o'], ['o'], []])
  assert.deepEqual(under(regions, 0, 1), [])
})

test('a band with no column inside it draws what it holds without its padding', () => {
  assert.deepEqual(plain(layout({ kind: 'band', background: 'prompt', child: { kind: 'text', text: 'ok' } }, 2, OPEN)).lines, ['ok'])
})

test('a band around what draws nothing draws nothing itself, not empty padding rows', () => {
  assert.deepEqual(plain(layout({ kind: 'band', background: 'prompt', child: { kind: 'stack', children: [] } }, 20, OPEN)).lines, [])
})

/** A document with one of each part, laid out at 20 columns. */
const document = { kind: 'markdown', text: '## Ship it\n\nRun `pnpm test` first.\n\n- one\n- two\n\n> quoted\n\n```\nx = 1\n```\n\n---' } as const

test('a markdown block is laid out as a document by pi-tui\'s component, and offers nothing', () => {
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

test('a document\'s parts are drawn in the theme\'s markdown styles', () => {
  const lines = layout(document, 20, OPEN).lines.map(line => line.trimEnd())
  assert.ok(lines[0]?.startsWith('\x1b[1m'), JSON.stringify(lines[0]))
  assert.equal(lines[2], 'Run \x1b[33mpnpm test\x1b[39m first.')
  assert.equal(lines[4], '\x1b[36m- \x1b[39mone')
  assert.ok(lines[7]?.startsWith('\x1b[2m│ \x1b[22m'), JSON.stringify(lines[7]))
  assert.equal(lines[9], '\x1b[2m```\x1b[22m')
  assert.equal(lines[13], '\x1b[2m' + '─'.repeat(20) + '\x1b[22m')
})

test('a tone an author\'s theme recolours draws in the colour it names, one of the terminal\'s sixteen', () => {
  const theme = themed(binnacleTheme, [{ tones: { accent: { color: 'red' }, muted: { color: 'bright-blue', bold: true } } }])
  assert.deepEqual(layout({ kind: 'text', text: 'hi', tone: 'accent' }, 10, { toggled: new Set() }, theme).lines, ['\x1b[31mhi\x1b[39m        '])
  assert.deepEqual(layout({ kind: 'text', text: 'hi', tone: 'muted' }, 10, { toggled: new Set() }, theme).lines, ['\x1b[94m\x1b[1mhi\x1b[22m\x1b[39m        '])
})

test('a band may be filled with a background an author\'s theme adds, one of the terminal\'s sixteen', () => {
  const theme = themed(binnacleTheme, [{ backgrounds: { failed: 'red' } }])
  assert.deepEqual(layout({ kind: 'band', background: 'failed', child: { kind: 'text', text: 'x' } }, 5, { toggled: new Set() }, theme).lines, ['\x1b[41m     \x1b[49m', '\x1b[41m x   \x1b[49m', '\x1b[41m     \x1b[49m'])
})

test('a span may name a mark an author\'s theme adds, drawn in its glyph and tone', () => {
  const theme = themed(binnacleTheme, [{ marks: { pinned: { glyph: '★', tone: 'warning' } } }])
  assert.deepEqual(layout({ kind: 'text', text: [{ mark: 'pinned' }, ' kept'] }, 8, { toggled: new Set() }, theme).lines, ['\x1b[33m★\x1b[39m kept  '])
})

test('a cut fold says what an author\'s theme gives the chrome and the words: its glyph, and a template counting the lines', () => {
  const theme = themed(binnacleTheme, [{ chrome: { cut: '+' }, words: { cut: '{n} hidden {lines}' } }])
  const fold = { kind: 'fold', id: 'f', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } } as const
  assert.deepEqual(layout(fold, 20, { toggled: new Set() }, theme).lines.map(line => line.trimEnd()), ['a', '+ 2 hidden lines'])
})

test('a card may be filled with a background and edged in a tone, both the theme\'s, every line of it filled', () => {
  const card = { kind: 'card', background: 'prompt', edge: 'accent', child: { kind: 'text', text: 'x' } } as const
  assert.deepEqual(layout(card, 6, { toggled: new Set() }).lines, [
    '\x1b[100m\x1b[36m╭────╮\x1b[39m\x1b[49m',
    '\x1b[100m\x1b[36m│\x1b[39m x  \x1b[36m│\x1b[39m\x1b[49m',
    '\x1b[100m\x1b[36m╰────╯\x1b[39m\x1b[49m',
  ])
})

test('a filled card stays filled around what it holds that is filled otherwise: every cell after an inner fill ends is the card\'s again', () => {
  const theme = themed(binnacleTheme, [{ backgrounds: { failed: 'red' } }])
  const card = { kind: 'card', background: 'failed', child: { kind: 'band', background: 'prompt', child: { kind: 'text', text: 'x' } } } as const
  for (const line of layout(card, 9, { toggled: new Set() }, theme).lines) {
    const inner = line.slice(0, -'\x1b[49m'.length)
    assert.equal(inner.split('\x1b[49m').slice(1).every(rest => rest.startsWith('\x1b[41m')), true, JSON.stringify(line))
  }
})

/**
 * A line saying the time since a moment a second in, laid out at a time.
 * @param now - the time.
 * @returns the line, plain.
 */
const since = (now: number): string => stripTerminalSequences(layout({ kind: 'text', text: ['running ', { since: 1_000 }] }, 40, { toggled: new Set(), now }).lines[0] ?? '').trimEnd()

test('a span that says the time since a moment is laid out at the time it is given: seconds, then minutes and seconds, then hours and minutes', () => {
  assert.equal(since(1_000), 'running 0s')
  assert.equal(since(5_400), 'running 4s')
  assert.equal(since(66_000), 'running 1m 05s')
  assert.equal(since(1_000 + 3_723_000), 'running 1h 02m')
})
