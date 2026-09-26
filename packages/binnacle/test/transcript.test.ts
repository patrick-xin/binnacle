import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fact } from '../src/facts/adapt.ts'
import { transcript } from '../src/models/transcript.ts'

const prompt: Fact = { kind: 'prompt', seq: 2, time: 10, blocks: [{ kind: 'text', text: 'fix the build' }] }
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

const call: Fact = { kind: 'call', seq: 5, time: 21, turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"pnpm build"}' }
const result: Fact = { kind: 'result', seq: 7, time: 40, turn: 1, step: 1, callId: 'c1', failed: false, blocks: [{ kind: 'text', text: 'ok' }], meta: undefined }

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

test('a result whose call is not in its turn is kept on its own, never dropped', () => {
  const facts: Fact[] = [{ kind: 'turn', seq: 1, time: 5, turn: 1, phase: 'start' }, result]
  assert.deepEqual(transcript(facts).turns[0]?.entries, [{ kind: 'result', fact: result }])
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
