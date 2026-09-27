import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Fact } from '../../src/facts/adapt.ts'
import type { Frame } from '../../src/ui/layout.ts'
import { initial } from '../../src/ui/state.ts'
import { adapt } from '../../src/facts/adapt.ts'
import { screen } from '../../src/views/screen.ts'
import { logged } from '../support/log.ts'
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


test('a turn that draws more lines than a spread can push still draws: one line at a time', () => {
  const long = `fix the build\n${'line\n'.repeat(199_999)}line`
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 1, turn: 1, phase: 'start' },
    promptFact(2, 1, long),
    { kind: 'turn', seq: 3, time: 3, turn: 1, phase: 'end', ending: 'completed' },
  ]
  assert.equal(screen(facts, initial, 40).lines.length, 200_001)
})

test('the screen over a real session\'s log is the conversation: no line for the machinery a session logs', () => {
  const facts = logged().map(event => adapt(event))
  const drawn = screen(facts, initial, 60)
  assert.deepEqual(plain(drawn).lines, [
    "› read readme",
    "∴ thinking",
    "… 1 more line",
    "I'll read the README file.",
    "● glob {\"pattern\": \"README*\"}",
    "node_modules/.pnpm/@earendil-works+pi-tui@0.85.1/node_module",
    "s/@earendil-works/pi-tui/native/darwin/README.md",
    "node_modules/.pnpm/@earendil-works+pi-tui@0.85.1/node_module",
    "… 298 more lines",
    "∴ thinking",
    "… 2 more lines",
    "● bash {\"command\": \"ls -1 | head -50\", \"description\": \"List",
    "root files\"}",
    "AGENTS.md",
    "CLAUDE.md",
    "docs",
    "… 13 more lines",
    "∴ thinking",
    "… 1 more line",
    "● read {\"file_path\": \"README.md\"}",
    "<path>/workspace/binnacle/README.md</path>",
    "<type>file</type>",
    "<content>",
    "… 27 more lines",
    "∴ thinking",
    "… 1 more line",
    "Here's the README:",
    "",
    "binnacle",
    "",
    "A terminal surface for DeepSeek Harness (dsh), mounted as a",
    "profile bundle and drawn with pi-tui.",
    "",
    "What is on screen says what can be done with it. A long",
    "command that was cut can be expanded; one that fits offers",
    "nothing, and no key or click reaches it. One table gives",
    "every gesture its meaning, so every screen answers the same",
    "way. A dsh preset can run a different tool loop, and an",
    "agent can draw what it logs through the same registrations",
    "this surface is built from.",
    "",
    "How it is built is the architecture, and why is the decision",
    "records. How to install, test and run it is in AGENTS.md,",
    "where agents start too.",
    "",
    "License",
    "",
    "MIT",
    "",
    "────────────────────────────────────────────────────────────",
    "",
    "The README is deliberately short — 11 lines. It points",
    "outward for the real detail:",
    "",
    "- Concepts and commitments → docs/architecture.md",
    "- Rationale for binding decisions → docs/adr/",
    "- Install / test / run commands → AGENTS.md#working-here",
    "  (pnpm install && pnpm refs, pnpm test, pnpm build, pnpm",
    "  dsh:profile, pnpm check:boot, dsh --profile binnacle)",
    "",
    "Want me to pull any of those up next?",
  ])
  assert.deepEqual(drawn.focusable, ['19/reasoning-0', '20/output', '25/reasoning-0', '26/output', '31/reasoning-0', '32/output', '37/reasoning-0'])
})

test('a region sits on the rows of the whole transcript, and what offers something can take focus, in screen order', () => {
  const context: Fact = { kind: 'context', seq: 5, time: 5, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb' }] }
  const [start, ...rest] = session(2)
  const drawn = screen([start as Fact, context, ...rest], initial, 40)
  assert.deepEqual(plain(drawn).lines.slice(0, 3), ['⋯ added by goal', '… 2 more lines', '› question 1'])
  assert.deepEqual(drawn.regions.map(({ region, top, height }) => [region.id, top, height]), [['5/context', 1, 1]])
  assert.deepEqual(drawn.focusable, ['5/context'])
})
