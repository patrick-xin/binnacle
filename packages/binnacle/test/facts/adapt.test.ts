import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
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

test('the files the agent presented are a presented fact: each path, and what the model said of it', () => {
  const event: SessionEvent<'deliverables/presented'> = {
    type: 'deliverables/presented', seq: SessionSeq(12), time: 3_000,
    data: { turn: 2, callId: ToolCallId('c9'), files: [{ path: 'dist/report.pdf', description: 'the audit' }, { path: 'notes.md' }] },
  }
  assert.deepEqual(adapt(event), { kind: 'presented', seq: 12, time: 3_000, files: [{ path: 'dist/report.pdf', description: 'the audit' }, { path: 'notes.md' }] })
})

test('what dsh says of the workspace changing is quiet: its home is a service of the host, and a feature that shows changed files will name it', () => {
  // `workspace/changes` is declared in a dsh package binnacle does not name: a kind it keeps quiet needs no reading.
  const event = { type: 'workspace/changes' as string, seq: SessionSeq(13), time: 3_100, data: { turn: 2 } } as SessionEvent
  assert.equal(adapt(event).kind, 'quiet')
})

test('a workflow run is read as it opens, as each member starts and settles, and as it stops', () => {
  const runId = 'wf-1' as never
  const events = [
    { type: 'tool-workflow/run-start', seq: SessionSeq(20), time: 1, data: { runId, name: 'review' } },
    { type: 'tool-workflow/agent-start', seq: SessionSeq(21), time: 2, data: { runId, seq: 0, label: 'lint', phase: 'check', childId: SessionId('child-1') } },
    { type: 'tool-workflow/agent-end', seq: SessionSeq(22), time: 3, data: { runId, seq: 0, outcome: 'failed' } },
    { type: 'tool-workflow/run-end', seq: SessionSeq(23), time: 4, data: { runId, stopReason: 'error' } },
  ] as const satisfies readonly SessionEvent[]
  assert.deepEqual(events.map(event => adapt(event)), [
    { kind: 'workflow', seq: 20, time: 1, runId: 'wf-1', name: 'review' },
    { kind: 'member', seq: 21, time: 2, runId: 'wf-1', member: 0, label: 'lint', phase: 'check' },
    { kind: 'member-end', seq: 22, time: 3, runId: 'wf-1', member: 0, outcome: 'failed' },
    { kind: 'workflow-end', seq: 23, time: 4, runId: 'wf-1', stopped: 'error' },
  ])
})

test('a call a run_code program made is read as it starts and as it settles, naming the call that ran the program', () => {
  const root = ToolCallId('c1')
  const sub = ToolCallId('c1:ptc:0')
  const started: SessionEvent<'tool/ptc-dispatch-start'> = { type: 'tool/ptc-dispatch-start', seq: SessionSeq(30), time: 1, data: { rootCallId: root, parentCallId: root, subCallId: sub, name: 'read', arguments: { path: 'a.ts' } } }
  const settled: SessionEvent<'tool/ptc-dispatch'> = { type: 'tool/ptc-dispatch', seq: SessionSeq(31), time: 2, data: { rootCallId: root, parentCallId: root, subCallId: sub, name: 'read', arguments: { path: 'a.ts' }, isError: true, content: [{ type: 'text', text: 'no such file' }], error: { name: 'ENOENT', code: 'enoent', reason: 'a.ts is missing' } } }
  assert.deepEqual(adapt(started), { kind: 'sub-call', seq: 30, time: 1, rootCallId: 'c1', subCallId: 'c1:ptc:0', name: 'read', arguments: '{"path":"a.ts"}' })
  assert.deepEqual(adapt(settled), { kind: 'sub-result', seq: 31, time: 2, rootCallId: 'c1', subCallId: 'c1:ptc:0', failed: true, reason: 'a.ts is missing', blocks: [{ kind: 'text', text: 'no such file' }] })
})

test('a retry dsh scheduled is a retry fact: which chain, which attempt of how many, when it starts, and what failed as a person reads it', () => {
  const event: SessionEvent<'llm/retry'> = {
    type: 'llm/retry', seq: SessionSeq(7), time: 1_500,
    data: { retryId: RetryId('r1'), turn: 1, step: 2, provider: 'deepseek', mode: 'normal', policyKey: 'default', retry: 2, maxRetries: 5, delayMs: 4_000, failure: { message: 'rate limited', code: 'RATE_LIMIT', status: 429 } },
  }
  assert.deepEqual(adapt(event), { kind: 'retry', seq: 7, time: 1_500, retryId: 'r1', turn: 1, step: 2, attempt: 2, of: 5, at: 5_500, failure: 'rate limited' })
})

test('a retry dsh schedules without end says no count, and its start is a retried fact naming the chain and the attempt', () => {
  const always: SessionEvent<'llm/retry'> = {
    type: 'llm/retry', seq: SessionSeq(7), time: 1_500,
    data: { retryId: RetryId('r1'), turn: 1, step: 2, provider: 'deepseek', mode: 'always', policyKey: 'default', retry: 9, delayMs: 1_000, failure: { message: 'overloaded', code: 'OVERLOADED' } },
  }
  assert.deepEqual(adapt(always), { kind: 'retry', seq: 7, time: 1_500, retryId: 'r1', turn: 1, step: 2, attempt: 9, at: 2_500, failure: 'overloaded' })
  const started: SessionEvent<'llm/retry-started'> = { type: 'llm/retry-started', seq: SessionSeq(8), time: 2_500, data: { retryId: RetryId('r1'), turn: 1, step: 2, retry: 9 } }
  assert.deepEqual(adapt(started), { kind: 'retried', seq: 8, time: 2_500, retryId: 'r1', attempt: 9 })
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

test('a command that ran is a fact carrying dsh\'s pairing id, the name, and the args as the person typed them', () => {
  const event: SessionEvent<'command/run'> = {
    type: 'command/run', seq: SessionSeq(7), time: 1_500,
    data: { commandId: CommandId('cmd-1a2b3c4d-1'), name: 'compact', args: ' --keep 2', source: { kind: 'user' } },
  }
  assert.deepEqual(adapt(event), {
    kind: 'run', seq: 7, time: 1_500, commandId: CommandId('cmd-1a2b3c4d-1'), name: 'compact', args: ' --keep 2', source: 'user',
  })
})

test('a command\'s done is a fact carrying the id of its run, the outcome in dsh\'s words, and what it returned', () => {
  const succeeded: SessionEvent<'command/done'> = {
    type: 'command/done', seq: SessionSeq(8), time: 1_600,
    data: { commandId: CommandId('cmd-1a2b3c4d-1'), kind: 'success', text: 'compacted: 12 messages folded to a summary', sourceEventSeq: SessionSeq(6) },
  }
  assert.deepEqual(adapt(succeeded), {
    kind: 'done', seq: 8, time: 1_600, commandId: CommandId('cmd-1a2b3c4d-1'), outcome: 'success', text: 'compacted: 12 messages folded to a summary', sourceEventSeq: SessionSeq(6),
  })
  const failed: SessionEvent<'command/done'> = {
    type: 'command/done', seq: SessionSeq(9), time: 1_700,
    data: { commandId: CommandId('cmd-1a2b3c4d-2'), kind: 'error', text: 'no such skill' },
  }
  assert.deepEqual(adapt(failed), { kind: 'done', seq: 9, time: 1_700, commandId: CommandId('cmd-1a2b3c4d-2'), outcome: 'error', text: 'no such skill' })
})

test('a command whose own event owns the payload ran with no args read', () => {
  const event: SessionEvent<'command/run'> = {
    type: 'command/run', seq: SessionSeq(10), time: 1_800,
    data: { commandId: CommandId('cmd-1a2b3c4d-3'), name: 'plan', source: { kind: 'user' } },
  }
  assert.deepEqual(adapt(event), { kind: 'run', seq: 10, time: 1_800, commandId: CommandId('cmd-1a2b3c4d-3'), name: 'plan', source: 'user' })
})

test('an approval the agent asked is a fact carrying dsh\'s request id, the tool, the call it is about, and why it asks', () => {
  const event: SessionEvent<'approval/asked'> = {
    type: 'approval/asked', seq: SessionSeq(10), time: 2_000,
    data: { id: ApprovalRequestId('a1'), toolName: 'bash', callId: ToolCallId('c1'), reason: 'writes outside the workspace' },
  }
  assert.deepEqual(adapt(event), {
    kind: 'asked', seq: 10, time: 2_000, id: ApprovalRequestId('a1'), toolName: 'bash', callId: ToolCallId('c1'), reason: 'writes outside the workspace',
  })
})

test('an approval\'s decision is a fact carrying the id of its ask and the outcome, in dsh\'s words', () => {
  const event: SessionEvent<'approval/decided'> = {
    type: 'approval/decided', seq: SessionSeq(11), time: 2_050,
    data: { id: ApprovalRequestId('a1'), outcome: 'rejected' },
  }
  assert.deepEqual(adapt(event), { kind: 'decided', seq: 11, time: 2_050, id: ApprovalRequestId('a1'), outcome: 'rejected' })
})

test('a compaction\'s start is read as a fact carrying dsh\'s id of it, which joins its summary and its end', () => {
  const event: SessionEvent<'compaction/start'> = {
    type: 'compaction/start', seq: SessionSeq(20), time: 3_000,
    data: { compactionId: CompactionId('cmp-1'), turn: 1 },
  }
  assert.deepEqual(adapt(event), { kind: 'start', seq: 20, time: 3_000, compactionId: CompactionId('cmp-1') })
})

test('a compaction\'s summary is read as a fact carrying how many items and about how many tokens it shadowed, and the summary itself', () => {
  const event: SessionEvent<'compaction/summary'> = {
    type: 'compaction/summary', seq: SessionSeq(21), time: 3_100,
    data: {
      compactionId: CompactionId('cmp-1'),
      summary: [{ type: 'text', text: 'The person asked to fix the build, and it did.' }],
      shadowedRange: { start: SessionSeq(3), end: SessionSeq(19) },
      shadowedSeqs: [SessionSeq(3), SessionSeq(4), SessionSeq(19)],
      shadowedTokenCount: 18_300,
      provider: 'deepseek',
      model: 'deepseek-v4',
      rawOutput: [{ type: 'text', text: 'The person asked to fix the build, and it did.' }],
      llmStreamCall: true,
    },
  }
  assert.deepEqual(adapt(event), {
    kind: 'summary', seq: 21, time: 3_100, compactionId: CompactionId('cmp-1'),
    items: 3, tokens: 18_300, blocks: [{ kind: 'text', text: 'The person asked to fix the build, and it did.' }],
  })
})

test('a compaction\'s end is read as a fact carrying the id of its compaction, and why it failed when it did', () => {
  const ended: SessionEvent<'compaction/end'> = {
    type: 'compaction/end', seq: SessionSeq(22), time: 3_200,
    data: { compactionId: CompactionId('cmp-1'), turn: 1 },
  }
  assert.deepEqual(adapt(ended), { kind: 'end', seq: 22, time: 3_200, compactionId: CompactionId('cmp-1') })
  const failed: SessionEvent<'compaction/end'> = {
    type: 'compaction/end', seq: SessionSeq(23), time: 3_300,
    data: { compactionId: CompactionId('cmp-2'), turn: null, error: 'summary: the provider refused the call' },
  }
  assert.deepEqual(adapt(failed), { kind: 'end', seq: 23, time: 3_300, compactionId: CompactionId('cmp-2'), error: 'summary: the provider refused the call' })
})

test('a user/message that replaced a surface range is quiet, never a prompt, whatever its source', () => {
  const checkpoint: SessionEvent<'user/message'> = {
    type: 'user/message',
    seq: SessionSeq(21), time: 3_150,
    surfaceOp: { op: 'replace', startSeq: SessionSeq(3), endSeq: SessionSeq(19) },
    data: {
      role: 'user', id: MessageId('m9'),
      source: { kind: 'compact-checkpoint', compactionId: CompactionId('cmp-1') },
      content: [{ type: 'text', text: 'The person asked to fix the build, and it did.' }],
    },
  }
  assert.deepEqual(adapt(checkpoint), { kind: 'quiet', seq: 21, time: 3_150, type: 'user/message', record: checkpoint })
  const asThePerson: SessionEvent<'user/message'> = {
    ...checkpoint,
    data: { ...checkpoint.data, source: { kind: 'user' } },
  }
  assert.deepEqual(adapt(asThePerson), { kind: 'quiet', seq: 21, time: 3_150, type: 'user/message', record: asThePerson })
})

test('a pruned tool/result copy that replaced the call\'s result is quiet, never a second result', () => {
  const event: SessionEvent<'tool/result'> = {
    type: 'tool/result', seq: SessionSeq(12), time: 2_450,
    surfaceOp: { op: 'replace', startSeq: SessionSeq(11), endSeq: SessionSeq(11) },
    data: {
      turn: 1, step: 1,
      message: { role: 'tool', id: MessageId('m7'), source: { kind: 'tool', callId: ToolCallId('c1') }, toolCallId: ToolCallId('c1'), content: [{ type: 'text', text: 'pruned for context' }] },
    },
  }
  assert.deepEqual(adapt(event), { kind: 'quiet', seq: 12, time: 2_450, type: 'tool/result', record: event })
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
