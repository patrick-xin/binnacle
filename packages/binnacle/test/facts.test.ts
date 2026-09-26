import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../src/facts/adapt.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A source only this test knows, as an out-of-tree plugin would declare one. */
    'test-notice': { kind: 'test-notice' }
  }
}

test('a line a person sent is a prompt, carrying its text', () => {
  const event: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(3),
    time: 1_000,
    surfaceOp: 'append',
    data: { role: 'user', id: MessageId('m1'), source: { kind: 'user' }, content: [{ type: 'text', text: 'fix the build' }] },
  }
  assert.deepEqual(adapt(event), { kind: 'prompt', seq: 3, time: 1_000, blocks: [{ kind: 'text', text: 'fix the build' }] })
})

test('a kind no adapter knows is an unknown fact, carrying its type and the raw record', () => {
  const event: SessionEvent<'session/end-seed'> = { type: 'session/end-seed', seq: SessionSeq(2), time: 900, data: {} }
  assert.deepEqual(adapt(event), { kind: 'unknown', seq: 2, time: 900, type: 'session/end-seed', record: event })
})

test('a turn opening is a turn fact', () => {
  const event: SessionEvent<'turn/start'> = { type: 'turn/start', seq: SessionSeq(1), time: 800, data: { turn: 1 } }
  assert.deepEqual(adapt(event), { kind: 'turn', seq: 1, time: 800, turn: 1, phase: 'start' })
})

test('a turn closing is a turn fact naming why it ended', () => {
  const event: SessionEvent<'turn/end'> = { type: 'turn/end', seq: SessionSeq(13), time: 2_600, data: { turn: 1, reason: { kind: 'interrupted' } } }
  assert.deepEqual(adapt(event), { kind: 'turn', seq: 13, time: 2_600, turn: 1, phase: 'end', ending: 'interrupted' })
})

test('a user-role message from any source but a person is context they did not type, naming its source', () => {
  const event: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(4),
    time: 1_100,
    surfaceOp: 'append',
    data: { role: 'user', id: MessageId('m2'), source: { kind: 'test-notice' }, content: [{ type: 'text', text: 'src/a.ts changed' }] },
  }
  assert.deepEqual(adapt(event), { kind: 'context', seq: 4, time: 1_100, source: 'test-notice', blocks: [{ kind: 'text', text: 'src/a.ts changed' }] })
})

test('a block binnacle cannot read yet is kept, named by its type, never read as empty text', () => {
  const event: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(5),
    time: 1_200,
    surfaceOp: 'append',
    data: { role: 'user', id: MessageId('m3'), source: { kind: 'user' }, content: [{ type: 'text', text: 'and this' }, { type: 'tool-removal', toolName: 'bash' }] },
  }
  assert.deepEqual(adapt(event), {
    kind: 'prompt', seq: 5, time: 1_200, blocks: [{ kind: 'text', text: 'and this' }, { kind: 'unread', type: 'tool-removal' }],
  })
})

test('the model\'s message for a step is an answer: its reasoning and text, who wrote it, and whether it was cut short', () => {
  const event: SessionEvent<'assistant/message'> = {
    type: 'assistant/message',
    seq: SessionSeq(8),
    time: 2_000,
    surfaceOp: 'append',
    data: {
      turn: 1,
      step: 1,
      stream: [],
      interrupted: true,
      message: {
        role: 'assistant',
        id: MessageId('m4'),
        source: { kind: 'model', provider: 'deepseek', model: 'deepseek-v4' },
        content: [{ type: 'reasoning', text: 'the build fails in tsc' }, { type: 'text', text: 'The build' }],
      },
    },
  }
  assert.deepEqual(adapt(event), {
    kind: 'answer',
    seq: 8,
    time: 2_000,
    turn: 1,
    step: 1,
    provider: 'deepseek',
    model: 'deepseek-v4',
    interrupted: true,
    blocks: [{ kind: 'reasoning', text: 'the build fails in tsc' }, { kind: 'text', text: 'The build' }],
  })
})

test('a tool the model asked for is a call, with its arguments exactly as the model wrote them', () => {
  const event: SessionEvent<'tool/call'> = {
    type: 'tool/call', seq: SessionSeq(9), time: 2_100,
    data: { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'bash', arguments: '{"command":"pnpm build"' },
  }
  assert.deepEqual(adapt(event), { kind: 'call', seq: 9, time: 2_100, turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"pnpm build"' })
})

test('a tool\'s result names its call, whether it failed and why, and keeps the tool\'s own payload untouched', () => {
  const event: SessionEvent<'tool/result'> = {
    type: 'tool/result', seq: SessionSeq(11), time: 2_400, surfaceOp: 'append',
    data: {
      turn: 1,
      step: 1,
      message: { role: 'tool', id: MessageId('m5'), source: { kind: 'tool', callId: ToolCallId('c1') }, toolCallId: ToolCallId('c1'), isError: true, content: [{ type: 'text', text: 'exit 2' }] },
      error: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' },
      meta: { exitCode: 2 },
    },
  }
  assert.deepEqual(adapt(event), {
    kind: 'result', seq: 11, time: 2_400, turn: 1, step: 1, callId: 'c1', failed: true,
    failure: { name: 'ExitError', code: 'exit', reason: 'the command exited 2' },
    blocks: [{ kind: 'text', text: 'exit 2' }],
    meta: { exitCode: 2 },
  })
})

test('a result that succeeded carries no failure', () => {
  const event: SessionEvent<'tool/result'> = {
    type: 'tool/result', seq: SessionSeq(12), time: 2_500, surfaceOp: 'append',
    data: { turn: 1, step: 2, message: { role: 'tool', id: MessageId('m6'), source: { kind: 'tool', callId: ToolCallId('c2') }, toolCallId: ToolCallId('c2'), content: [] } },
  }
  assert.deepEqual(adapt(event), { kind: 'result', seq: 12, time: 2_500, turn: 1, step: 2, callId: 'c2', failed: false, blocks: [], meta: undefined })
})

test('a step opening or closing is a step fact', () => {
  const start: SessionEvent<'step/start'> = { type: 'step/start', seq: SessionSeq(6), time: 1_300, data: { turn: 1, step: 1 } }
  const end: SessionEvent<'step/end'> = { type: 'step/end', seq: SessionSeq(12), time: 2_550, data: { turn: 1, step: 1 } }
  assert.deepEqual(adapt(start), { kind: 'step', seq: 6, time: 1_300, turn: 1, step: 1, phase: 'start' })
  assert.deepEqual(adapt(end), { kind: 'step', seq: 12, time: 2_550, turn: 1, step: 1, phase: 'end' })
})
