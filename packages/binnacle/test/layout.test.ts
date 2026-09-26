import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import { layout, under } from '../src/ui/layout.ts'
import type { Frame } from '../src/ui/layout.ts'

const OPEN = { expanded: new Set<string>() }

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
    regions: [{ region: { id: 'answer:4', affordances: [{ kind: 'copy', label: 'copy the answer' }], overflows: false }, top: 1, height: 2 }],
  })
})

const long = { kind: 'fold', id: 'tool:c1', rows: 2, child: { kind: 'text', text: 'l1\nl2\nl3\nl4' } } as const

test('a fold whose content was cut shows its first rows, says what it cut, and offers expand', () => {
  assert.deepEqual(plain(layout(long, 20, OPEN)), {
    lines: ['l1', 'l2', '… 2 more lines'],
    regions: [{ region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'show 2 more lines' }], overflows: false }, top: 0, height: 3 }],
  })
})

test('an expanded fold shows everything, and expand folds it back', () => {
  assert.deepEqual(plain(layout(long, 20, { expanded: new Set(['tool:c1']) })), {
    lines: ['l1', 'l2', 'l3', 'l4'],
    regions: [{ region: { id: 'tool:c1', affordances: [{ kind: 'expand', label: 'fold to 2 lines' }], overflows: false }, top: 0, height: 4 }],
  })
})

test('a fold whose content fits offers nothing, so no gesture reaches it', () => {
  assert.deepEqual(plain(layout({ ...long, rows: 4 }, 20, OPEN)), { lines: ['l1', 'l2', 'l3', 'l4'], regions: [] })
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
  assert.deepEqual(under(regions, 1).map(region => region.id), ['inner', 'outer'])
  assert.deepEqual(under(regions, 0).map(region => region.id), ['outer'])
  assert.deepEqual(under(regions, 2), [])
})

test('a blank is one empty line, which text cannot be: pi-tui draws nothing for it', () => {
  assert.deepEqual(plain(layout({ kind: 'stack', children: [{ kind: 'text', text: 'a' }, { kind: 'blank' }, { kind: 'text', text: 'b' }] }, 10, OPEN)).lines, ['a', '', 'b'])
})

/** What expand says on an open fold that shows so many rows while folded. */
const label = (rows: number): string | undefined =>
  layout({ ...long, rows }, 20, { expanded: new Set(['tool:c1']) }).regions[0]?.region.affordances[0]?.label

test('an open fold says in words what folding does: away, to one line, or to its lines', () => {
  assert.deepEqual([label(0), label(1), label(2)], ['fold it away', 'fold to 1 line', 'fold to 2 lines'])
})
