import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { adapt } from '../../src/facts/adapt.ts'
import { kinds } from '../../src/facts/kinds.ts'
import { seed as seedEvent } from '../support/events.ts'

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
  const event: SessionEvent<'test/marker'> = { type: 'test/marker', seq: SessionSeq(2), time: 900, data: {} }
  assert.deepEqual(adapt(event), { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: event })
})

test('a kind named unread is left to the fallback on purpose: an unknown fact, as a kind dsh does not know is', () => {
  // `command/run`'s declaration lives in a dsh package binnacle does not name, so it is not on the union the adapter is typed against — though the run-time set of dsh's kinds counts it, which is what the table is held to.
  const event = { type: 'command/run' as string, seq: SessionSeq(7), time: 1_500, data: { name: 'compact' } } as SessionEvent
  assert.deepEqual(adapt(event), { kind: 'unknown', seq: 7, time: 1_500, type: 'command/run', record: event })
})

test('an event of a quiet kind is a quiet fact, carrying its type and the event for a view an author registers for the kind', () => {
  for (const [type, treatment] of Object.entries(kinds)) {
    if (treatment !== 'quiet') continue
    const event = { type, seq: SessionSeq(4), time: 1_400, data: {} } as SessionEvent
    assert.deepEqual(adapt(event), { kind: 'quiet', seq: 4, time: 1_400, type, record: event })
  }
})

test('a turn opening is a turn fact', () => {
  const event: SessionEvent<'turn/start'> = { type: 'turn/start', seq: SessionSeq(1), time: 800, data: { turn: 1 } }
  assert.deepEqual(adapt(event), { kind: 'turn', seq: 1, time: 800, turn: 1, phase: 'start' })
})

test('a turn closing is a turn fact naming why it ended', () => {
  const event: SessionEvent<'turn/end'> = { type: 'turn/end', seq: SessionSeq(13), time: 2_600, data: { turn: 1, reason: { kind: 'interrupted' } } }
  assert.deepEqual(adapt(event), { kind: 'turn', seq: 13, time: 2_600, turn: 1, phase: 'end', ending: 'interrupted' })
})

test('a user/message whose source is not the person is quiet: dsh web shows no row for context they did not type', () => {
  const event: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(4),
    time: 1_100,
    surfaceOp: 'append',
    data: { role: 'user', id: MessageId('m2'), source: { kind: 'test-notice' }, content: [{ type: 'text', text: 'src/a.ts changed' }] },
  }
  assert.deepEqual(adapt(event), { kind: 'quiet', seq: 4, time: 1_100, type: 'user/message', record: event })
})

test('a user/message that adds or removes tools is context, naming its source, as dsh web keeps its row', () => {
  const event: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(4),
    time: 1_100,
    surfaceOp: 'append',
    data: {
      role: 'user',
      id: MessageId('m2'),
      source: { kind: 'test-notice' },
      content: [{ type: 'text', text: 'the tools changed' }, { type: 'tool-addition', toolName: 'bash' }],
    },
  }
  assert.deepEqual(adapt(event), {
    kind: 'context', seq: 4, time: 1_100, source: 'test-notice',
    blocks: [{ kind: 'text', text: 'the tools changed' }, { kind: 'unread', type: 'tool-addition' }],
  })
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

test('a developer message is context when it changes the tools, quiet when it does not, as the Chat row it keeps is', () => {
  const tools: SessionEvent<'developer/message'> = {
    type: 'developer/message', seq: SessionSeq(6), time: 1_250, surfaceOp: 'append',
    data: { turn: 1, step: 1, message: { role: 'developer', id: MessageId('m4'), source: { kind: 'tool-registry' }, content: [{ type: 'tool-addition', toolName: 'bash' }] } },
  }
  assert.deepEqual(adapt(tools), {
    kind: 'context', seq: 6, time: 1_250, source: 'tool-registry', blocks: [{ kind: 'unread', type: 'tool-addition' }],
  })
  const said: SessionEvent<'developer/message'> = {
    ...tools, seq: SessionSeq(7),
    data: { ...tools.data, message: { ...tools.data.message, id: MessageId('m5'), content: [{ type: 'text', text: 'a word from the registry' }] } },
  }
  assert.deepEqual(adapt(said), { kind: 'quiet', seq: 7, time: 1_250, type: 'developer/message', record: said })
})

test('a step opening or closing is a step fact', () => {
  const start: SessionEvent<'step/start'> = { type: 'step/start', seq: SessionSeq(6), time: 1_300, data: { turn: 1, step: 1 } }
  const end: SessionEvent<'step/end'> = { type: 'step/end', seq: SessionSeq(12), time: 2_550, data: { turn: 1, step: 1 } }
  assert.deepEqual(adapt(start), { kind: 'step', seq: 6, time: 1_300, turn: 1, step: 1, phase: 'start' })
  assert.deepEqual(adapt(end), { kind: 'step', seq: 12, time: 2_550, turn: 1, step: 1, phase: 'end' })
})

const seed = seedEvent(2, 900)

/** What an adapter returns beyond its name and data: a kind and a place in the log that are not its to say. */
const overreaching = { name: 'seeded', data: { from: 'fork' }, kind: 'prompt', seq: 99 }

test('an author\'s fact is its name and data, in the event\'s place; nothing else the adapter returns reaches it', () => {
  assert.deepEqual(adapt(seed, new Map([['test/marker', () => overreaching]])), { kind: 'authored', seq: 2, time: 900, name: 'seeded', data: { from: 'fork' } })
})

test('an author\'s adapter that throws, or names nothing, leaves the event unknown and says which adapter and why', () => {
  const threw = new Map([['test/marker', () => { throw new Error('no fork recorded') }]])
  assert.deepEqual(adapt(seed, threw), { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: seed, problem: 'binnacle.facts(test/marker) threw: no fork recorded' })
  const nameless = new Map([['test/marker', () => ({ data: 1 }) as unknown as { name: string, data: unknown }]])
  assert.deepEqual(adapt(seed, nameless), { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: seed, problem: 'binnacle.facts(test/marker) named no fact: it must return { name, data }' })
})

/** An adapter whose result throws when its name is read. */
const unreadable = (): { name: string, data: unknown } => ({ get name(): string { throw new Error('name unavailable') }, data: {} })

test('an adapter whose result throws when read is fenced like one that throws when called', () => {
  assert.deepEqual(adapt(seed, new Map([['test/marker', unreadable]])), { kind: 'unknown', seq: 2, time: 900, type: 'test/marker', record: seed, problem: 'binnacle.facts(test/marker) threw: name unavailable' })
})
