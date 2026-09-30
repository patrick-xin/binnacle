import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { describe } from '../contract/index.ts'
import { kinds } from './kinds.ts'
import type { CompactionId } from '@deepseek-ai/dsh-compaction'
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { SessionEvent, SessionEventType, SessionSeq } from '@deepseek-ai/dsh-session'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { ApprovalOutcome, ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
import type { RetryId } from '@deepseek-ai/dsh-llm-retry'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type { ToolWorkflowAgentStartData } from '@deepseek-ai/dsh-tool-workflow/types'
import type { PtcDispatchStartEventData } from '@deepseek-ai/dsh-tools/types'
import type { WorkflowAgentOutcome, WorkflowRunId, WorkflowStopReason } from '@deepseek-ai/dsh-workflow/types'

/** A piece of message content, as a view draws it; `unread` names a kind of block binnacle cannot read yet. */
export type Block =
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'reasoning', readonly text: string }
  | { readonly kind: 'unread', readonly type: string }

/** What every fact carries: where it sits in the log, and when it was logged. */
interface Logged {
  /** The event's position in the log. */
  readonly seq: number
  /** When it was logged, in Unix epoch milliseconds. */
  readonly time: number
}

/** Something that happened in a session, read out of its log. */
export type Fact =
  | Logged & {
    readonly kind: 'turn'
    /** Which turn. */
    readonly turn: number
    /** Whether it opens or closes. */
    readonly phase: 'start' | 'end'
    /** Why it ended, as dsh names the reason's kind (`completed`, `interrupted`, …; plugins add more); only on `end`. */
    readonly ending?: string
  }
  | Logged & {
    readonly kind: 'step'
    /** The turn it is in. */
    readonly turn: number
    /** Which step of that turn: one model call and the tools it asked for. */
    readonly step: number
    /** Whether it opens or closes. */
    readonly phase: 'start' | 'end'
  }
  | Logged & {
    readonly kind: 'prompt'
    /** What the person sent. */
    readonly blocks: readonly Block[]
  }
  | Logged & {
    readonly kind: 'context'
    /** Who put it into the session: a dsh source kind, such as `agent-instructions`; never `user`. */
    readonly source: string
    /** What was added. */
    readonly blocks: readonly Block[]
  }
  | Logged & {
    readonly kind: 'answer'
    /** The turn it answers. */
    readonly turn: number
    /** The step of that turn it was written in. */
    readonly step: number
    /** Who served it. */
    readonly provider: string
    /** The model that wrote it. */
    readonly model: string
    /** Whether the turn was cancelled while it streamed, leaving what had arrived. */
    readonly interrupted: boolean
    /** What it said, reasoning included. */
    readonly blocks: readonly Block[]
  }
  | Logged & {
    readonly kind: 'call'
    /** The turn it was asked in. */
    readonly turn: number
    /** The step of that turn. */
    readonly step: number
    /** Pairs the call with its result. */
    readonly callId: string
    /** The tool asked for. */
    readonly name: string
    /** Its arguments, exactly as the model wrote them: JSON, and not always valid. */
    readonly arguments: string
  }
  | Logged & {
    readonly kind: 'result'
    /** The turn its call was asked in. */
    readonly turn: number
    /** The step of that turn. */
    readonly step: number
    /** The call it answers. */
    readonly callId: string
    /** Whether the tool failed. */
    readonly failed: boolean
    /** Why, for a person: dsh keeps it out of what the model sees. Present only on a failure that gave one. */
    readonly failure?: { readonly name: string, readonly code: string, readonly reason?: string }
    /** What the model was told. */
    readonly blocks: readonly Block[]
    /** The tool's own payload for presenting its result, opaque to everyone but that tool; undefined when it attached none. */
    readonly meta: unknown
  }
  | Logged & {
    readonly kind: 'run'
    /** dsh's id of the run, which pairs it with the done that settles it (dsh's `CommandId`). */
    readonly commandId: CommandId
    /** The command's name, dsh's own split of the line: lowercase, with no slash. */
    readonly name: string
    /** The text that followed the name, exactly as the person typed it, separator whitespace included; absent when the command's own domain event owns the input's payload. */
    readonly args?: string
    /** Who issued the line, a dsh source kind; `user` today (dsh's `CommandSource`). */
    readonly source: string
  }
  | Logged & {
    readonly kind: 'done'
    /** dsh's id of the run this settles, the run fact's `commandId`. */
    readonly commandId: CommandId
    /** How the command settled, in dsh's words. */
    readonly outcome: 'success' | 'error'
    /** What the command returned, as a person reads it; a failure always has one. */
    readonly text?: string
    /** An earlier authoritative event that owns what the command did, when one does (dsh's `CommandResult`); present only on a success that named one. */
    readonly sourceEventSeq?: SessionSeq
  }
  | Logged & {
    readonly kind: 'authored'
    /** The name its author's adapter gave it; a view registered under the name draws it. */
    readonly name: string
    /** What the adapter read out of the event, in the author's shape. */
    readonly data: unknown
  }
  | Logged & {
    readonly kind: 'asked'
    /** dsh's id of the request, which pairs the ask with the decision that answers it (dsh's `ApprovalRequestId`). */
    readonly id: ApprovalRequestId
    /** The tool the question is about. */
    readonly toolName: string
    /** The exact tool call being decided, when the asker had one. */
    readonly callId?: ToolCallId
    /** Why the asker asks, as a person reads it; present only when the asker gave one. */
    readonly reason?: string
  }
  | Logged & {
    readonly kind: 'decided'
    /** dsh's id of the ask this answers, the asked fact's `id`. */
    readonly id: ApprovalRequestId
    /** What was decided, in dsh's words (`allowed-once`, `rejected`, `cancelled`, `unavailable`; dsh's `ApprovalOutcome`). */
    readonly outcome: ApprovalOutcome
  }
  | Logged & {
    readonly kind: 'presented'
    /** The files the agent handed the person, each where it lies and what the model said of it. */
    readonly files: readonly Readonly<PresentedFile>[]
  }
  | Logged & {
    readonly kind: 'sub-call'
    /** The call whose `run_code` program made it, at the top of any nesting: the call entry it is drawn in. */
    readonly rootCallId: string
    /** Pairs it with its settling. */
    readonly subCallId: string
    /** The tool it called. */
    readonly name: PtcDispatchStartEventData['name']
    /** What it called it with, as JSON. */
    readonly arguments: string
  }
  | Logged & {
    readonly kind: 'sub-result'
    /** The call whose program made it. */
    readonly rootCallId: string
    /** The sub-call it settles. */
    readonly subCallId: string
    /** Whether it failed. */
    readonly failed: boolean
    /** Why it failed, as dsh says it to a person, when it says. */
    readonly reason?: string
    /** What it returned. */
    readonly blocks: readonly Block[]
  }
  | Logged & {
    readonly kind: 'workflow'
    /** dsh's id of the run, which joins its members and its stop as one entry (dsh's `WorkflowRunId`). */
    readonly runId: WorkflowRunId
    /** What the run is called. */
    readonly name: string
  }
  | Logged & {
    readonly kind: 'member'
    /** The run it belongs to. */
    readonly runId: WorkflowRunId
    /** Which member of the run, counting from 0, pairing it with its settling. */
    readonly member: number
    /** What the member is called. */
    readonly label: ToolWorkflowAgentStartData['label']
    /** The phase of the run it works in, when the run names phases. */
    readonly phase?: ToolWorkflowAgentStartData['phase']
  }
  | Logged & {
    readonly kind: 'member-end'
    /** The run it belongs to. */
    readonly runId: WorkflowRunId
    /** Which member settled. */
    readonly member: number
    /** How it settled, in dsh's words (dsh's `WorkflowAgentOutcome`). */
    readonly outcome: WorkflowAgentOutcome
  }
  | Logged & {
    readonly kind: 'workflow-end'
    /** The run that stopped. */
    readonly runId: WorkflowRunId
    /** Why it stopped, in dsh's words (dsh's `WorkflowStopReason`). */
    readonly stopped: WorkflowStopReason
  }
  | Logged & {
    readonly kind: 'retry'
    /** dsh's id of the chain of retries this attempt belongs to, which joins them as one entry (dsh's `RetryId`). */
    readonly retryId: RetryId
    /** The turn and step whose model request it retries. */
    readonly turn: number
    readonly step: number
    /** Which retry this is, counting from 1. */
    readonly attempt: number
    /** How many retries the chain may take; none when dsh retries until it succeeds. */
    readonly of?: number
    /** When it is scheduled to start, in Unix epoch milliseconds: its log time and dsh's delay. */
    readonly at: number
    /** What failed, as dsh says it to a person. */
    readonly failure: string
  }
  | Logged & {
    readonly kind: 'retried'
    /** dsh's id of the chain, the retry fact's `retryId`. */
    readonly retryId: RetryId
    /** Which retry started. */
    readonly attempt: number
  }
  | Logged & {
    readonly kind: 'start'
    /** dsh's id of the compaction, which joins its summary and its end as one entry (dsh's `CompactionId`). */
    readonly compactionId: CompactionId
  }
  | Logged & {
    readonly kind: 'summary'
    /** dsh's id of the compaction whose summary it is, the start fact's `compactionId`. */
    readonly compactionId: CompactionId
    /** How many items the compaction shadowed: dsh's `shadowedSeqs` on `compaction/summary`, counted. */
    readonly items: number
    /** About how many tokens they held: dsh's `shadowedTokenCount`, an estimate, read as dsh writes it. */
    readonly tokens: number
    /** The summary the model now sees in their place. */
    readonly blocks: readonly Block[]
  }
  | Logged & {
    readonly kind: 'end'
    /** dsh's id of the compaction it ends, the start fact's `compactionId`. */
    readonly compactionId: CompactionId
    /** Why the compaction failed, in dsh's words on `compaction/end`; absent when it compacted. */
    readonly error?: string
  }
  | Logged & {
    readonly kind: 'quiet'
    /** The event's dsh type, the key a view registered for the kind draws it under. */
    readonly type: string
    /** The event as dsh logged it, for the view an author registers for the kind. */
    readonly record: unknown
  }
  | Logged & {
    readonly kind: 'unknown'
    /** The event's dsh type. */
    readonly type: string
    /** The event as dsh logged it. */
    readonly record: unknown
    /** Why an author's adapter for its type made no fact of it; absent when none was registered. */
    readonly problem?: string
  }

type Adapter<K extends SessionEventType> = (event: SessionEvent<K>) => Fact

/** An author's adapter for one kind of event: it names the fact and says what it holds. The name must not be an entry kind binnacle draws, such as `prompt` or `tool`. */
export type AuthorAdapter = (event: SessionEvent) => { readonly name: string, readonly data: unknown }

function replaced(event: SessionEvent): Fact {
  return { kind: 'quiet', seq: event.seq, time: event.time, type: event.type, record: event }
}

export function blockOf(block: ContentBlock): Block {
  if (block.type === 'text') return { kind: 'text', text: block.text }
  if (block.type === 'reasoning') return { kind: 'reasoning', text: block.text }
  return { kind: 'unread', type: block.type }
}

function changesTools(content: readonly ContentBlock[]): boolean {
  return content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal')
}

const adapters: { readonly [K in SessionEventType]?: Adapter<K> } = {
  'turn/start': ({ seq, time, data }) => ({ kind: 'turn', seq, time, turn: data.turn, phase: 'start' }),
  'turn/end': ({ seq, time, data }) => ({ kind: 'turn', seq, time, turn: data.turn, phase: 'end', ending: data.reason.kind }),
  'step/start': ({ seq, time, data }) => ({ kind: 'step', seq, time, turn: data.turn, step: data.step, phase: 'start' }),
  'step/end': ({ seq, time, data }) => ({ kind: 'step', seq, time, turn: data.turn, step: data.step, phase: 'end' }),
  'user/message': (event) => {
    if (!isAppendSurfaceEvent(event)) return replaced(event)
    const blocks = event.data.content.map(blockOf)
    const source = event.data.source.kind
    return source === 'user'
      ? { kind: 'prompt', seq: event.seq, time: event.time, blocks }
      : changesTools(event.data.content)
        ? { kind: 'context', seq: event.seq, time: event.time, source, blocks }
        : replaced(event)
  },
  'developer/message': (event) => {
    if (!isAppendSurfaceEvent(event)) return replaced(event)
    const message = event.data.message
    return changesTools(message.content)
      ? { kind: 'context', seq: event.seq, time: event.time, source: message.source.kind, blocks: message.content.map(blockOf) }
      : replaced(event)
  },
  'assistant/message': (event) => {
    if (!isAppendSurfaceEvent(event)) return replaced(event)
    const { seq, time, data } = event
    return {
      kind: 'answer',
      seq,
      time,
      turn: data.turn,
      step: data.step,
      provider: data.message.source.provider,
      model: data.message.source.model,
      interrupted: data.interrupted === true,
      blocks: data.message.content.map(blockOf),
    }
  },
  'tool/call': ({ seq, time, data }) => ({
    kind: 'call', seq, time, turn: data.turn, step: data.step, callId: data.callId, name: data.name, arguments: data.arguments,
  }),
  'approval/asked': ({ seq, time, data }) => ({
    kind: 'asked', seq, time, id: data.id, toolName: data.toolName,
    ...data.callId === undefined ? {} : { callId: data.callId },
    ...data.reason === undefined ? {} : { reason: data.reason },
  }),
  'approval/decided': ({ seq, time, data }) => ({ kind: 'decided', seq, time, id: data.id, outcome: data.outcome }),
  'command/run': ({ seq, time, data }) => ({
    kind: 'run', seq, time, commandId: data.commandId, name: data.name, source: data.source.kind,
    ...data.args === undefined ? {} : { args: data.args },
  }),
  'command/done': ({ seq, time, data }) => ({
    kind: 'done', seq, time, commandId: data.commandId, outcome: data.kind,
    ...data.text === undefined ? {} : { text: data.text },
    ...data.sourceEventSeq === undefined ? {} : { sourceEventSeq: data.sourceEventSeq },
  }),
  'deliverables/presented': ({ seq, time, data }) => ({
    kind: 'presented', seq, time,
    files: data.files.map(file => file.description === undefined ? { path: file.path } : { path: file.path, description: file.description }),
  }),
  'tool/ptc-dispatch-start': ({ seq, time, data }) => ({
    kind: 'sub-call', seq, time, rootCallId: data.rootCallId, subCallId: data.subCallId, name: data.name, arguments: JSON.stringify(data.arguments) ?? '',
  }),
  'tool/ptc-dispatch': ({ seq, time, data }) => ({
    kind: 'sub-result', seq, time, rootCallId: data.rootCallId, subCallId: data.subCallId, failed: data.isError,
    ...data.error?.reason === undefined ? {} : { reason: data.error.reason },
    blocks: data.content.map(blockOf),
  }),
  'tool-workflow/run-start': ({ seq, time, data }) => ({ kind: 'workflow', seq, time, runId: data.runId, name: data.name }),
  'tool-workflow/agent-start': ({ seq, time, data }) => ({
    kind: 'member', seq, time, runId: data.runId, member: data.seq, label: data.label, ...data.phase === undefined ? {} : { phase: data.phase },
  }),
  'tool-workflow/agent-end': ({ seq, time, data }) => ({ kind: 'member-end', seq, time, runId: data.runId, member: data.seq, outcome: data.outcome }),
  'tool-workflow/run-end': ({ seq, time, data }) => ({ kind: 'workflow-end', seq, time, runId: data.runId, stopped: data.stopReason }),
  'llm/retry': ({ seq, time, data }) => ({
    kind: 'retry', seq, time, retryId: data.retryId, turn: data.turn, step: data.step, attempt: data.retry,
    ...data.mode === 'normal' ? { of: data.maxRetries } : {},
    at: time + data.delayMs, failure: data.failure.message,
  }),
  'llm/retry-started': ({ seq, time, data }) => ({ kind: 'retried', seq, time, retryId: data.retryId, attempt: data.retry }),
  'compaction/start': ({ seq, time, data }) => ({ kind: 'start', seq, time, compactionId: data.compactionId }),
  'compaction/summary': ({ seq, time, data }) => ({
    kind: 'summary', seq, time, compactionId: data.compactionId,
    items: data.shadowedSeqs.length, tokens: data.shadowedTokenCount, blocks: data.summary.map(blockOf),
  }),
  'compaction/end': ({ seq, time, data }) => ({
    kind: 'end', seq, time, compactionId: data.compactionId,
    ...data.error === undefined ? {} : { error: data.error },
  }),
  'tool/result': (event) => {
    if (!isAppendSurfaceEvent(event)) return replaced(event)
    const { seq, time, data } = event
    return {
      kind: 'result',
      seq,
      time,
      turn: data.turn,
      step: data.step,
      callId: data.message.toolCallId,
      failed: data.message.isError === true,
      ...data.error === undefined ? {} : { failure: { name: data.error.name, code: data.error.code, ...data.error.reason === undefined ? {} : { reason: data.error.reason } } },
      blocks: data.message.content.map(blockOf),
      meta: data.meta,
    }
  },
}

/**
 * Read an event with an author's adapter, which is code binnacle does not own.
 * @returns the authored fact; an `unknown` one saying why, when the adapter or reading what it returned throws, or it names no fact.
 */
function authored(event: SessionEvent, author: AuthorAdapter): Fact {
  const failed = (problem: string): Fact => ({ kind: 'unknown', seq: event.seq, time: event.time, type: event.type, record: event, problem: `binnacle.facts(${event.type}) ${problem}` })
  let name: unknown
  let data: unknown
  try {
    const read: unknown = author(event)
    if (typeof read === 'object' && read !== null) {
      name = 'name' in read ? read.name : undefined
      data = 'data' in read ? read.data : undefined
    }
  } catch (error) {
    return failed(`threw: ${describe(error)}`)
  }
  if (typeof name !== 'string') return failed('named no fact: it must return { name, data }')
  return { kind: 'authored', seq: event.seq, time: event.time, name, data }
}

/**
 * @param authors - authors' adapters by event type; one for a kind binnacle also reads wins.
 * @returns the fact it is; `unknown` when no adapter reads its kind.
 */
export function adapt(event: SessionEvent, authors: ReadonlyMap<string, AuthorAdapter> = new Map()): Fact {
  const author = authors.get(event.type)
  if (author !== undefined) return settled(authored(event, author))
  const adapter = adapters[event.type] as Adapter<typeof event.type> | undefined
  return settled(adapter !== undefined
    ? adapter(event)
    : kinds[event.type] === 'quiet'
      ? { kind: 'quiet', seq: event.seq, time: event.time, type: event.type, record: event }
      : { kind: 'unknown', seq: event.seq, time: event.time, type: event.type, record: event })
}

/**
 * Freeze what binnacle made of an event, so an author's view handed it cannot change what binnacle folds. What a
 * fact carries opaquely, a record, a tool's payload or an author's data, is not binnacle's to freeze.
 */
function settled(fact: Fact): Fact {
  if ('blocks' in fact) {
    for (const block of fact.blocks) Object.freeze(block)
    Object.freeze(fact.blocks)
  }
  if (fact.kind === 'result' && fact.failure !== undefined) Object.freeze(fact.failure)
  return Object.freeze(fact)
}
