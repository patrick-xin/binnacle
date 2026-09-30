import type { Fact } from '../facts/adapt.ts'
import type { Streamed } from '../facts/stream.ts'

/** A fact of one kind. */
type FactOf<K extends Fact['kind']> = Extract<Fact, { readonly kind: K }>

/** An entry holding one fact, its kind the fact's: distributed so each kind narrows its fact. */
type Single<K extends Fact['kind']> = K extends unknown ? { readonly kind: K, readonly fact: FactOf<K> } : never

/** The kinds of fact that stand as an entry of their own, never paired with another. */
type Alone = 'prompt' | 'context' | 'answer' | 'result' | 'decided' | 'done' | 'summary' | 'end' | 'retried' | 'presented' | 'member' | 'member-end' | 'workflow-end' | 'authored' | 'unknown' | 'quiet'

/**
 * One thing a turn holds, in log order: a fact, or a tool call with its
 * result once it has one. A `result` entry is a result whose call is not in
 * its turn, kept rather than dropped. A tool entry is `left` when its turn
 * ended without the call's result: how the turn ended, as dsh names it, and
 * gone again once a late result answers the call. A prompt is a `steer` when
 * it reached a turn that already held one: a line the person sent while the
 * agent worked, which dsh hands the running turn at its next step. An
 * `approval` entry is an approval the agent asked for, with the decision
 * that answered it once it has one, as a tool entry is a call with its
 * result; a `decided` entry is a decision whose ask is not in its turn,
 * kept rather than dropped. A `command` entry is a command that ran, with
 * the done that settled it once it has one, paired the same way; a `done`
 * entry is a done whose run is not in its turn, kept rather than dropped. A
 * `compaction` entry is one compaction of the context — where the model
 * stopped seeing earlier history — opened where it started and holding its
 * summary and its end once each has arrived; a `summary` or `end` entry is
 * one whose compaction is not in its turn, kept rather than dropped. A
 * `streaming` entry is the answer the model is still writing, at the end of
 * its turn until the log holds it.
 */
export type Entry =
  | Single<Exclude<Alone, 'prompt'>>
  | { readonly kind: 'prompt', readonly fact: FactOf<'prompt'>, readonly steer?: true }
  | { readonly kind: 'tool', readonly call: FactOf<'call'>, readonly result?: FactOf<'result'>, readonly left?: string }
  | { readonly kind: 'approval', readonly asked: FactOf<'asked'>, readonly decided?: FactOf<'decided'> }
  | { readonly kind: 'command', readonly run: FactOf<'run'>, readonly done?: FactOf<'done'> }
  | { readonly kind: 'compaction', readonly start: FactOf<'start'>, readonly summary?: FactOf<'summary'>, readonly end?: FactOf<'end'> }
  | { readonly kind: 'workflow', readonly run: FactOf<'workflow'>, readonly members: readonly { readonly start: FactOf<'member'>, readonly end?: FactOf<'member-end'> }[], readonly end?: FactOf<'workflow-end'>, readonly left?: string }
  | { readonly kind: 'retry', readonly retry: FactOf<'retry'>, readonly started?: FactOf<'retried'>, readonly left?: string }
  | { readonly kind: 'streaming', readonly answer: Streamed }

/** What a person sent and everything the agent did about it. */
export interface Turn {
  readonly turn: number | null
  readonly entries: readonly Entry[]
  readonly ending?: string
}

export interface Transcript {
  readonly turns: readonly Turn[]
}

/** The transcript of a session with nothing logged yet. */
export const empty: Transcript = { turns: [] }

// TypeScript cannot correlate an entry's kind with its fact across the union, so the pairing is asserted here, once.
function single<K extends Alone>(fact: FactOf<K>): Single<K> {
  return Object.freeze({ kind: (fact as Fact).kind, fact }) as Single<K>
}

/** Each entry it makes is frozen, so an author's view cannot change what later facts fold into. */
export function fold(model: Transcript, fact: Fact): Transcript {
  if (fact.kind === 'step') return model
  if (fact.kind === 'turn') {
    if (fact.phase === 'start') return { turns: [...model.turns, { turn: fact.turn, entries: [] }] }
    const last = model.turns.at(-1)
    if (last === undefined) return model
    const ending = fact.ending
    const entries = ending === undefined ? last.entries : last.entries.map(entry => (entry.kind === 'tool' && entry.result === undefined) || (entry.kind === 'retry' && entry.started === undefined) || (entry.kind === 'workflow' && entry.end === undefined) ? Object.freeze({ ...entry, left: ending }) : entry)
    return { turns: [...model.turns.slice(0, -1), { ...last, entries, ...ending === undefined ? {} : { ending } }] }
  }
  const last = model.turns.at(-1) ?? { turn: null, entries: [] }
  const turns = model.turns.length === 0 ? [] : model.turns.slice(0, -1)
  let entries: readonly Entry[]
  if (fact.kind === 'call') {
    entries = [...last.entries, Object.freeze({ kind: 'tool', call: fact })]
  } else if (fact.kind === 'result') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'tool' && entry.call.callId === fact.callId)
    const pending = last.entries[at]
    entries = pending?.kind === 'tool' ? last.entries.with(at, Object.freeze({ kind: 'tool', call: pending.call, result: fact })) : [...last.entries, single(fact)]
  } else if (fact.kind === 'asked') {
    entries = [...last.entries, Object.freeze({ kind: 'approval', asked: fact })]
  } else if (fact.kind === 'decided') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'approval' && entry.asked.id === fact.id)
    const pending = last.entries[at]
    entries = pending?.kind === 'approval' ? last.entries.with(at, Object.freeze({ kind: 'approval', asked: pending.asked, decided: fact })) : [...last.entries, single(fact)]
  } else if (fact.kind === 'run') {
    entries = [...last.entries, Object.freeze({ kind: 'command', run: fact })]
  } else if (fact.kind === 'done') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'command' && entry.run.commandId === fact.commandId)
    const pending = last.entries[at]
    entries = pending?.kind === 'command' ? last.entries.with(at, Object.freeze({ kind: 'command', run: pending.run, done: fact })) : [...last.entries, single(fact)]
  } else if (fact.kind === 'workflow') {
    entries = [...last.entries, Object.freeze({ kind: 'workflow', run: fact, members: Object.freeze([]) })]
  } else if (fact.kind === 'member' || fact.kind === 'member-end' || fact.kind === 'workflow-end') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'workflow' && entry.run.runId === fact.runId)
    const pending = last.entries[at]
    if (pending?.kind !== 'workflow') entries = [...last.entries, single(fact)]
    else {
      const members = fact.kind === 'member'
        ? [...pending.members, Object.freeze({ start: fact })]
        : fact.kind === 'member-end' ? pending.members.map(member => member.start.member === fact.member ? Object.freeze({ ...member, end: fact }) : member) : pending.members
      entries = last.entries.with(at, Object.freeze({ ...pending, members: Object.freeze(members), ...fact.kind === 'workflow-end' ? { end: fact } : {} }))
    }
  } else if (fact.kind === 'retry') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'retry' && entry.retry.retryId === fact.retryId)
    entries = at === -1 ? [...last.entries, Object.freeze({ kind: 'retry', retry: fact })] : last.entries.with(at, Object.freeze({ kind: 'retry', retry: fact }))
  } else if (fact.kind === 'retried') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'retry' && entry.retry.retryId === fact.retryId)
    const pending = last.entries[at]
    entries = pending?.kind !== 'retry'
      ? [...last.entries, single(fact)]
      : pending.retry.attempt === fact.attempt ? last.entries.with(at, Object.freeze({ kind: 'retry', retry: pending.retry, started: fact })) : last.entries
  } else if (fact.kind === 'start') {
    entries = [...last.entries, Object.freeze({ kind: 'compaction', start: fact })]
  } else if (fact.kind === 'summary' || fact.kind === 'end') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'compaction' && entry.start.compactionId === fact.compactionId)
    const pending = last.entries[at]
    const held = fact.kind === 'summary' ? { summary: fact } : { end: fact }
    entries = pending?.kind === 'compaction'
      ? last.entries.with(at, Object.freeze({ kind: 'compaction', start: pending.start, ...pending.summary === undefined ? {} : { summary: pending.summary }, ...held, ...pending.end === undefined ? {} : { end: pending.end } }))
      : [...last.entries, single(fact)]
  } else if (fact.kind === 'prompt' && last.turn !== null && last.entries.some(entry => entry.kind === 'prompt')) {
    entries = [...last.entries, Object.freeze({ kind: 'prompt', fact, steer: true })]
  } else {
    entries = [...last.entries, single(fact)]
  }
  return { turns: [...turns, { ...last, entries }] }
}

/**
 * How many entries can no longer change: all before the last turn's answer streaming, first running command or compaction,
 * or, while that turn runs, its first call or approval still waiting. dsh can log a command or compaction outside a turn.
 */
export function settled(model: Transcript): number {
  const last = model.turns.at(-1)
  const before = model.turns.slice(0, -1).reduce((count, turn) => count + turn.entries.length, 0)
  if (last === undefined) return 0
  const waiting = last.entries.findIndex(entry => entry.kind === 'streaming' || (entry.kind === 'command' && entry.done === undefined)
    || (entry.kind === 'compaction' && entry.end === undefined)
    || (last.ending === undefined && ((entry.kind === 'tool' && entry.result === undefined) || (entry.kind === 'approval' && entry.decided === undefined) || (entry.kind === 'retry' && entry.started === undefined) || (entry.kind === 'workflow' && entry.end === undefined))))
  return before + (waiting === -1 ? last.entries.length : waiting)
}

export function transcript(facts: readonly Fact[]): Transcript {
  return facts.reduce(fold, empty)
}

/** A transcript with the answer streaming now at the end of its last turn. */
export function answering(model: Transcript, answer: Streamed | undefined): Transcript {
  if (answer === undefined) return model
  const last = model.turns.at(-1) ?? { turn: null, entries: [] }
  if (last.entries.some(entry => entry.kind === 'answer' && entry.fact.turn === answer.turn && entry.fact.step === answer.step)) return model
  return { turns: [...model.turns.slice(0, -1), { ...last, entries: [...last.entries, Object.freeze({ kind: 'streaming', answer })] }] }
}
