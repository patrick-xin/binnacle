import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Fact } from '../src/facts/adapt.ts'
import type { Frame } from '../src/ui/layout.ts'
import { initial } from '../src/ui/state.ts'
import { screen } from '../src/views/screen.ts'

/** A frame as a person reads it. */
const plain = (frame: Frame): Frame => ({ lines: frame.lines.map(line => stripTerminalSequences(line).trimEnd()), regions: frame.regions })

/**
 * A session of turns, each a prompt answered in one line.
 * @param count - how many turns.
 * @returns its facts.
 */
function session(count: number): Fact[] {
  const facts: Fact[] = []
  for (let turn = 1; turn <= count; turn++) {
    const seq = turn * 10
    facts.push(
      { kind: 'turn', seq, time: seq, turn, phase: 'start' },
      { kind: 'prompt', seq: seq + 1, time: seq, blocks: [{ kind: 'text', text: `question ${turn}` }] },
      { kind: 'answer', seq: seq + 2, time: seq, turn, step: 1, provider: 'p', model: 'm', interrupted: false, blocks: [{ kind: 'text', text: `answer ${turn}` }] },
      { kind: 'turn', seq: seq + 3, time: seq, turn, phase: 'end', ending: 'completed' },
    )
  }
  return facts
}

test('a session that fits is every turn, a blank line between them, in a transcript that does not overflow', () => {
  assert.deepEqual(plain(screen(session(2), initial, { width: 40, height: 10 })), {
    lines: ['› question 1', 'answer 1', '', '› question 2', 'answer 2'],
    regions: [{ region: { id: 'transcript', affordances: [], overflows: false }, top: 0, height: 5 }],
  })
})

test('a session longer than the screen shows its end, and the transcript overflows', () => {
  assert.deepEqual(plain(screen(session(3), initial, { width: 40, height: 4 })), {
    lines: ['answer 2', '', '› question 3', 'answer 3'],
    regions: [{ region: { id: 'transcript', affordances: [], overflows: true }, top: 0, height: 4 }],
  })
})

/**
 * Three turns on four rows, scrolled.
 * @param scroll - rows above the end.
 * @returns the lines shown.
 */
const at = (scroll: number): readonly string[] => plain(screen(session(3), { ...initial, scroll }, { width: 40, height: 4 })).lines

test('scrolling moves the window toward the start, stopping at the top', () => {
  assert.deepEqual(at(3), ['answer 1', '', '› question 2', 'answer 2'])
  assert.deepEqual(at(99), ['› question 1', 'answer 1', '', '› question 2'])
})

test('a region moves with its rows, and is clipped where the window cuts it', () => {
  const context: Fact = { kind: 'context', seq: 5, time: 5, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }
  const [start, ...rest] = session(2)
  const frame = screen([start as Fact, context, ...rest], { ...initial, scroll: 3 }, { width: 40, height: 3 })
  assert.deepEqual(plain(frame).lines, ['… 2 more lines', '› question 1', 'answer 1'])
  assert.deepEqual(frame.regions.map(({ region, top, height }) => [region.id, top, height]), [['transcript', 0, 3], ['context:5', 0, 1]])
})

test('the screen says how far it can scroll, and which regions on it can take focus, in screen order', () => {
  const context: Fact = { kind: 'context', seq: 5, time: 5, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }
  const [start, ...rest] = session(2)
  const drawn = screen([start as Fact, context, ...rest], initial, { width: 40, height: 3 })
  assert.deepEqual(drawn.bounds, { scrollLimit: 4, focusable: [] })
  assert.deepEqual(screen([start as Fact, context, ...rest], { ...initial, scroll: 4 }, { width: 40, height: 3 }).bounds, { scrollLimit: 4, focusable: ['context:5'] })
})
