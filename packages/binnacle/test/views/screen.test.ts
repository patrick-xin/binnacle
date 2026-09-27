import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Frame } from '../../src/ui/layout.ts'
import { initial } from '../../src/ui/state.ts'
import { screen } from '../../src/views/screen.ts'
import { prompt as promptFact } from '../support/facts.ts'

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
      promptFact(seq + 1, seq, `question ${turn}`),
      { kind: 'answer', seq: seq + 2, time: seq, turn, step: 1, provider: 'p', model: 'm', interrupted: false, blocks: [{ kind: 'text', text: `answer ${turn}` }] },
      { kind: 'turn', seq: seq + 3, time: seq, turn, phase: 'end', ending: 'completed' },
    )
  }
  return facts
}

test('the screen is every turn, a blank line between them, however long the session: pi-tui windows it', () => {
  assert.deepEqual(plain(screen(session(3), initial, 40)), {
    lines: ['› question 1', 'answer 1', '', '› question 2', 'answer 2', '', '› question 3', 'answer 3'],
    regions: [],
  })
})

test('a region sits on the rows of the whole transcript, and what offers something can take focus, in screen order', () => {
  const context: Fact = { kind: 'context', seq: 5, time: 5, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }
  const [start, ...rest] = session(2)
  const drawn = screen([start as Fact, context, ...rest], initial, 40)
  assert.deepEqual(plain(drawn).lines.slice(0, 3), ['⋯ added by goal', '… 2 more lines', '› question 1'])
  assert.deepEqual(drawn.regions.map(({ region, top, height }) => [region.id, top, height]), [['context:5', 1, 1]])
  assert.deepEqual(drawn.focusable, ['context:5'])
})
