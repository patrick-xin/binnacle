/**
 * The facts adapter: one dsh session event, read once, as one fact.
 *
 * This is where dsh's event shapes are read, and nowhere else below the host;
 * everything above it knows only the facts it returns. A kind with no
 * adapter is an `unknown` fact carrying its raw record, so the fallback view
 * can show it: dsh has already refused any log whose unknown events are not
 * marked ignorable, so what arrives here unadapted is a kind binnacle has
 * not learned yet, never one it may silently drop.
 * @module binnacle/facts/adapt
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionEventType } from '@deepseek-ai/dsh-session'

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
    readonly kind: 'unknown'
    /** The event's dsh type. */
    readonly type: string
    /** The event as dsh logged it. */
    readonly record: unknown
  }

/** An adapter for one kind of event. */
type Adapter<K extends SessionEventType> = (event: SessionEvent<K>) => Fact

/**
 * Read one content block.
 * @param block - dsh's block.
 * @returns ours.
 */
function blockOf(block: ContentBlock): Block {
  if (block.type === 'text') return { kind: 'text', text: block.text }
  if (block.type === 'reasoning') return { kind: 'reasoning', text: block.text }
  return { kind: 'unread', type: block.type }
}

/** Every kind binnacle has learned, and how it reads one. */
const adapters: { readonly [K in SessionEventType]?: Adapter<K> } = {
  'turn/start': ({ seq, time, data }) => ({ kind: 'turn', seq, time, turn: data.turn, phase: 'start' }),
  'turn/end': ({ seq, time, data }) => ({ kind: 'turn', seq, time, turn: data.turn, phase: 'end', ending: data.reason.kind }),
  'step/start': ({ seq, time, data }) => ({ kind: 'step', seq, time, turn: data.turn, step: data.step, phase: 'start' }),
  'step/end': ({ seq, time, data }) => ({ kind: 'step', seq, time, turn: data.turn, step: data.step, phase: 'end' }),
  'user/message': (event) => {
    const blocks = event.data.content.map(blockOf)
    const source = event.data.source.kind
    return source === 'user'
      ? { kind: 'prompt', seq: event.seq, time: event.time, blocks }
      : { kind: 'context', seq: event.seq, time: event.time, source, blocks }
  },
  'assistant/message': ({ seq, time, data }) => ({
    kind: 'answer',
    seq,
    time,
    turn: data.turn,
    step: data.step,
    provider: data.message.source.provider,
    model: data.message.source.model,
    interrupted: data.interrupted === true,
    blocks: data.message.content.map(blockOf),
  }),
  'tool/call': ({ seq, time, data }) => ({
    kind: 'call', seq, time, turn: data.turn, step: data.step, callId: data.callId, name: data.name, arguments: data.arguments,
  }),
  'tool/result': ({ seq, time, data }) => ({
    kind: 'result',
    seq,
    time,
    turn: data.turn,
    step: data.step,
    callId: data.message.toolCallId,
    failed: data.message.isError === true,
    ...data.error === undefined ? {} : { failure: data.error },
    blocks: data.message.content.map(blockOf),
    meta: data.meta,
  }),
}

/**
 * Adapt one session event.
 * @param event - the event, as dsh logged it.
 * @returns the fact it is; `unknown` when no adapter reads its kind.
 */
export function adapt(event: SessionEvent): Fact {
  const adapter = adapters[event.type] as Adapter<typeof event.type> | undefined
  return adapter === undefined
    ? { kind: 'unknown', seq: event.seq, time: event.time, type: event.type, record: event }
    : adapter(event)
}
