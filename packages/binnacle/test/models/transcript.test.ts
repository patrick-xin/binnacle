import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../../src/facts/adapt.ts'
import { settled, transcript } from '../../src/models/transcript.ts'
import { prompt as promptFact, call as callFact, returned as returnedFact, asked as askedFact, decided as decidedFact } from '../support/facts.ts'

const prompt = promptFact(2, 10, 'fix the build')
const answer: Fact = { kind: 'answer', seq: 4, time: 20, turn: 1, step: 1, provider: 'deepseek', model: 'deepseek-v4', interrupted: false, blocks: [{ kind: 'text', text: 'Done.' }] }

test('a turn holds what happened in it, in log order, and why it ended; steps are not entries', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    { kind: 'step', seq: 3, time: 15, turn: 1, step: 1, phase: 'start' },
    answer,
    { kind: 'step', seq: 5, time: 25, turn: 1, step: 1, phase: 'end' },
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'completed' },
  ]
  assert.deepEqual(transcript(facts), {
    turns: [{ turn: 1, entries: [{ kind: 'prompt', fact: prompt }, { kind: 'answer', fact: answer }], ending: 'completed' }],
  })
})

const call = callFact(5, 21, 'c1', 'bash', '{"command":"pnpm build"}')
const result = returnedFact(7, 40, 'c1', 'ok')

test('a call and its result are one tool entry, where the call was asked', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    answer,
    call,
    { kind: 'step', seq: 6, time: 30, turn: 1, step: 1, phase: 'end' },
    result,
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'answer', fact: answer },
    { kind: 'tool', call, result },
  ])
})

test('an approval asked and its decision are one entry, where it was asked, as a call and its result are', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    askedFact(5, 22, 'a1', 'bash', 'writes outside the workspace'),
    decidedFact(6, 24, 'a1', 'allowed-once'),
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'approval', asked: askedFact(5, 22, 'a1', 'bash', 'writes outside the workspace'), decided: decidedFact(6, 24, 'a1', 'allowed-once') },
  ])
})

test('a result whose call is not in its turn is kept on its own, never dropped', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, result]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'result', fact: result }])
})

test('a decision whose ask is not in its turn is kept on its own, never dropped, as a result without its call is', () => {
  const orphan = decidedFact(3, 30, 'a9', 'rejected')
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, orphan]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'decided', fact: orphan }])
})

test('what the log holds before its first turn opens the transcript, in a turn numbered null', () => {
  const seeded: Fact = { kind: 'context', seq: 0, time: 1, source: 'agent-instructions', blocks: [{ kind: 'text', text: 'AGENTS.md' }] }
  const facts: Fact[] = [seeded, { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt]
  assert.deepEqual(transcript(facts).turns, [
    { turn: null, entries: [{ kind: 'context', fact: seeded }] },
    { turn: 1, entries: [{ kind: 'prompt', fact: prompt }] },
  ])
})

test('a turn still running has no ending, and a call still running has no result', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, prompt, call]
  assert.deepEqual(transcript(facts).turns, [{ turn: 1, entries: [{ kind: 'prompt', fact: prompt }, { kind: 'tool', call }] }])
})

test('a turn\'s end marks its calls left without results, with how the turn ended', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    prompt,
    call,
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'aborted' },
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [
    { kind: 'prompt', fact: prompt },
    { kind: 'tool', call, left: 'aborted' },
  ])
})

test('a result arriving for a left call answers it, and the mark is gone', () => {
  const facts: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    call,
    { kind: 'turn', seq: 6, time: 30, turn: 1, phase: 'end', ending: 'aborted' },
    result,
  ]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'tool', call, result }])
})

/** A turn starting. */
const start = (seq: number, turn: number): Fact => ({ kind: 'turn', seq, time: seq, turn, phase: 'start' })

/** The call, asked again under another id. */
const asked = (seq: number, callId: string): Fact => callFact(seq, 21, callId, 'bash', '{"command":"pnpm build"}')

/** The result, for a call of another id. */
const returned = (seq: number, callId: string): Fact => returnedFact(seq, 40, callId, 'ok')

test('what has settled is every entry, oldest first, up to a call still waiting for its result in a turn still running', () => {
  const interrupted: Fact = { kind: 'turn', seq: 4, time: 4, turn: 1, phase: 'end', ending: 'aborted' }
  const facts: Fact[] = [start(1, 1), prompt, asked(3, 'c1'), interrupted, start(5, 2), prompt, answer, asked(8, 'c2'), asked(9, 'c3'), returned(10, 'c3')]
  // Turn 1 ended with c1 still waiting, so both its entries have settled. In turn 2, c2 waits: the prompt and the answer before it have settled; c2 and c3 after it have not.
  assert.equal(settled(transcript(facts)), 4)
  assert.equal(settled(transcript([...facts, returned(11, 'c2')])), 6)
  assert.equal(settled(transcript([...facts, { kind: 'turn', seq: 11, time: 11, turn: 2, phase: 'end', ending: 'aborted' }])), 6)
  assert.equal(settled(transcript([asked(1, 'c0')])), 0)
})

test('an approval still waiting for its decision holds back settling, as a call still waiting for its result does', () => {
  const facts: Fact[] = [start(1, 1), prompt, askedFact(3, 21, 'a1', 'bash', 'writes outside the workspace'), answer]
  // The approval waits between the prompt and the answer: it and the answer after it have not settled, for the decision will change the entry.
  assert.equal(settled(transcript(facts)), 1)
  assert.equal(settled(transcript([...facts, decidedFact(5, 24, 'a1', 'allowed-once')])), 3)
})

test('nothing the log holds is dropped: every fact but a turn\'s and a step\'s is held by exactly one entry, paired or alone', () => {
  const machinery: Fact[] = [
    { kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' },
    { kind: 'step', seq: 3, time: 15, turn: 1, step: 1, phase: 'start' },
    { kind: 'step', seq: 8, time: 25, turn: 1, step: 1, phase: 'end' },
    { kind: 'turn', seq: 13, time: 30, turn: 1, phase: 'end', ending: 'completed' },
  ]
  const held: Fact[] = [
    prompt,
    { kind: 'context', seq: 5, time: 18, source: 'goal', blocks: [{ kind: 'text', text: 'ship it' }] },
    answer,
    call,
    askedFact(9, 26, 'a1', 'bash', 'writes outside the workspace'),
    decidedFact(10, 27, 'a1', 'allowed-once'),
    // A decision whose ask is not in the log: kept on its own, never dropped.
    decidedFact(11, 28, 'a9', 'rejected'),
    { kind: 'authored', seq: 6, time: 19, name: 'seeded', data: { from: 'fork' } },
    { kind: 'unknown', seq: 7, time: 20, type: 'test/marker', record: {} },
    { kind: 'quiet', seq: 12, time: 29, type: 'session/title', record: {} },
  ]
  const drawn: Fact[] = []
  for (const turn of transcript([...machinery, ...held]).turns) {
    for (const entry of turn.entries) {
      if (entry.kind === 'tool') drawn.push(entry.call, ...entry.result === undefined ? [] : [entry.result])
      else if (entry.kind === 'approval') drawn.push(entry.asked, ...entry.decided === undefined ? [] : [entry.decided])
      else drawn.push(entry.fact)
    }
  }
  // Entries hold their facts in log order, so what they hold reads back as the log does, turn and step facts excepted: the model spends those naming the turns themselves.
  assert.deepEqual(drawn, held)
})

test('a prompt in a turn that already holds one steered it; the turn\'s first prompt, and one before any turn, did not', () => {
  const steer = promptFact(8, 30, 'use pnpm')
  const facts: Fact[] = [
    promptFact(1, 1, 'before any turn'),
    { kind: 'turn', seq: 2, time: 5, turn: 1, phase: 'start' },
    { kind: 'quiet', seq: 3, time: 6, type: 'agent/inbox/spliced', record: {} } as Fact,
    promptFact(4, 10, 'fix the build'),
    call,
    steer,
  ]
  assert.deepEqual(transcript(facts).turns.map(turn => turn.entries.filter(entry => entry.kind === 'prompt')), [
    [{ kind: 'prompt', fact: promptFact(1, 1, 'before any turn') }],
    [{ kind: 'prompt', fact: promptFact(4, 10, 'fix the build') }, { kind: 'prompt', fact: steer, steer: true }],
  ])
})
