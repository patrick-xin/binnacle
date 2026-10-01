import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { LlmAttemptId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { AnswerStream } from '../../src/facts/stream.ts'

const attemptId = LlmAttemptId('a1')
const start: AssistantStreamFrame = { type: 'start', attemptId, revision: 1, turn: 2, step: 1 }
const chunks = (...list: StreamChunk[]): AssistantStreamFrame[] =>
  list.map((chunk, index) => ({ type: 'chunk', attemptId, revision: 1, index, time: 5_000 + index, chunk }))

test("an answer's text is read as its chunks arrive, before anything is logged", () => {
  const stream = new AnswerStream()
  for (const frame of [
    start,
    ...chunks(
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Hel' },
      { type: 'text-delta', index: 0, text: 'lo' },
    ),
  ])
    stream.read(frame)
  assert.deepEqual(stream.answer, { turn: 2, step: 1, blocks: [{ kind: 'text', text: 'Hello' }] })
})

test('an attempt that ends, logged or abandoned, leaves no answer streaming', () => {
  for (const outcome of [{ kind: 'committed', eventType: 'assistant/message', seq: 9 }, { kind: 'abandoned' }] as const) {
    const stream = new AnswerStream()
    for (const frame of [
      start,
      ...chunks({ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'Hi' }),
    ])
      stream.read(frame)
    stream.read({ type: 'end', attemptId, revision: 1, index: 2, outcome } as AssistantStreamFrame)
    assert.equal(stream.answer, undefined, outcome.kind)
  }
})

test('a frame of another attempt leaves the one streaming as it was', () => {
  const stream = new AnswerStream()
  for (const frame of [
    start,
    ...chunks({ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'Hi' }),
  ])
    stream.read(frame)
  const other = LlmAttemptId('a0')
  stream.read({
    type: 'chunk',
    attemptId: other,
    revision: 1,
    index: 5,
    time: 5_010,
    chunk: { type: 'text-delta', index: 0, text: ' there' },
  })
  stream.read({ type: 'end', attemptId: other, revision: 1, index: 6, outcome: { kind: 'abandoned' } })
  assert.deepEqual(stream.answer, { turn: 2, step: 1, blocks: [{ kind: 'text', text: 'Hi' }] })
})

test('thinking streams with the text, and a tool call being streamed is not read', () => {
  const stream = new AnswerStream()
  for (const frame of [
    start,
    ...chunks(
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'Look first.' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'Reading it.' },
      { type: 'block-start', index: 2, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 2, id: ToolCallId('c1'), name: 'read', argumentsDelta: '{"pa' },
    ),
  ])
    stream.read(frame)
  assert.deepEqual(stream.answer?.blocks, [
    { kind: 'reasoning', text: 'Look first.' },
    { kind: 'text', text: 'Reading it.' },
  ])
})
