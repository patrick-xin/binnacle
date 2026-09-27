/**
 * The facts adapter: one dsh session event as one fact.
 *
 * This is where dsh's event shapes are read, and nowhere else below the host;
 * everything above it knows only the facts it returns. Every kind dsh knows
 * is named in the kinds table (`kinds.ts`): a kind named `read` has an
 * adapter here; a kind named `quiet` becomes a `quiet` fact, which the
 * transcript draws as nothing; a kind named `unread`, and a kind dsh does
 * not know at all, is an `unknown` fact carrying its raw record, so the
 * fallback view can show it — dsh has already refused any log whose unknown
 * events are not marked ignorable, so what arrives here unadapted is a kind
 * binnacle has not learned yet, never one it may silently drop.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { describe } from '../contract/index.ts'
import { kinds } from './kinds.ts'
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
    readonly kind: 'authored'
    /** The name its author's adapter gave it; a view registered under the name draws it. */
    readonly name: string
    /** What the adapter read out of the event, in the author's shape. */
    readonly data: unknown
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

/** An adapter for one kind of event. */
type Adapter<K extends SessionEventType> = (event: SessionEvent<K>) => Fact

/** An author's adapter for one kind of event: it names the fact and says what it holds. The name must not be an entry kind binnacle draws, such as `prompt` or `tool`. */
export type AuthorAdapter = (event: SessionEvent) => { readonly name: string, readonly data: unknown }

/**
 * Read one of dsh's content blocks as binnacle's.
 */
function blockOf(block: ContentBlock): Block {
  if (block.type === 'text') return { kind: 'text', text: block.text }
  if (block.type === 'reasoning') return { kind: 'reasoning', text: block.text }
  return { kind: 'unread', type: block.type }
}

/**
 * Whether a message's content adds or removes tools: the one context dsh
 * web's Chat keeps a row for (`dsh:packages/client/ui-chat/src/client/contract/chat-visibility.ts#isVisibleChatNode`),
 * so the one binnacle draws.
 */
function changesTools(content: readonly ContentBlock[]): boolean {
  return content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal')
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
      : changesTools(event.data.content)
        ? { kind: 'context', seq: event.seq, time: event.time, source, blocks }
        : { kind: 'quiet', seq: event.seq, time: event.time, type: 'user/message', record: event }
  },
  'developer/message': (event) => {
    const message = event.data.message
    return changesTools(message.content)
      ? { kind: 'context', seq: event.seq, time: event.time, source: message.source.kind, blocks: message.content.map(blockOf) }
      : { kind: 'quiet', seq: event.seq, time: event.time, type: 'developer/message', record: event }
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
    ...data.error === undefined ? {} : { failure: { name: data.error.name, code: data.error.code, ...data.error.reason === undefined ? {} : { reason: data.error.reason } } },
    blocks: data.message.content.map(blockOf),
    meta: data.meta,
  }),
}

/**
 * Read an event with an author's adapter, which is code binnacle does not own.
 * @param event - the event.
 * @param author - the adapter registered for its type.
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
 * Adapt one session event.
 * @param event - the event, as dsh logged it.
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
 * Freeze what binnacle made of an event — the fact, its blocks, its failure —
 * so an author's view handed it cannot change what binnacle folds. What a
 * fact carries opaquely, a record, a tool's payload or an author's data, is
 * not binnacle's to freeze.
 * @returns the fact itself.
 */
function settled(fact: Fact): Fact {
  if ('blocks' in fact) {
    for (const block of fact.blocks) Object.freeze(block)
    Object.freeze(fact.blocks)
  }
  if (fact.kind === 'result' && fact.failure !== undefined) Object.freeze(fact.failure)
  return Object.freeze(fact)
}
