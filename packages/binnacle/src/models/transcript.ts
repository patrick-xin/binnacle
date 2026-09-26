/**
 * The transcript: the facts of a session folded into turns.
 *
 * A pure fold, so the host can apply one fact as it arrives and a replay can
 * apply the whole log, and both reach the same transcript.
 * @module binnacle/models/transcript
 */

import type { Fact } from '../facts/adapt.ts'

/** A fact of one kind. */
type FactOf<K extends Fact['kind']> = Extract<Fact, { readonly kind: K }>

/**
 * One thing a turn holds, in log order: a fact, or a tool call with its
 * result once it has one. A `result` entry is a result whose call is not in
 * its turn, kept rather than dropped.
 */
export type Entry =
  | { readonly kind: 'prompt' | 'context' | 'answer' | 'result' | 'unknown', readonly fact: FactOf<'prompt' | 'context' | 'answer' | 'result' | 'unknown'> }
  | { readonly kind: 'tool', readonly call: FactOf<'call'>, readonly result?: FactOf<'result'> }

/** A turn: what a person sent and everything the agent did about it. */
export interface Turn {
  /** dsh's turn number; `null` for what the log holds before its first turn. */
  readonly turn: number | null
  /** What happened in it, in log order. */
  readonly entries: readonly Entry[]
  /** Why it ended, as dsh names it; absent while it runs. */
  readonly ending?: string
}

/** A session, as turns. */
export interface Transcript {
  /** Every turn, oldest first. */
  readonly turns: readonly Turn[]
}

/** The transcript of a session with nothing logged yet. */
export const empty: Transcript = { turns: [] }

/**
 * Fold one fact into a transcript.
 * @param model - the transcript so far.
 * @param fact - the next fact in log order.
 * @returns the transcript with it folded in; `model` is left as it was.
 */
export function fold(model: Transcript, fact: Fact): Transcript {
  if (fact.kind === 'step') return model
  if (fact.kind === 'turn') {
    if (fact.phase === 'start') return { turns: [...model.turns, { turn: fact.turn, entries: [] }] }
    const last = model.turns.at(-1)
    if (last === undefined) return model
    return { turns: [...model.turns.slice(0, -1), { ...last, ...fact.ending === undefined ? {} : { ending: fact.ending } }] }
  }
  const last = model.turns.at(-1) ?? { turn: null, entries: [] }
  const turns = model.turns.length === 0 ? [] : model.turns.slice(0, -1)
  let entries: readonly Entry[]
  if (fact.kind === 'call') {
    entries = [...last.entries, { kind: 'tool', call: fact }]
  } else if (fact.kind === 'result') {
    const at = last.entries.findLastIndex(entry => entry.kind === 'tool' && entry.call.callId === fact.callId)
    const pending = last.entries[at]
    entries = pending?.kind === 'tool' ? last.entries.with(at, { ...pending, result: fact }) : [...last.entries, { kind: 'result', fact }]
  } else {
    entries = [...last.entries, { kind: fact.kind, fact }]
  }
  return { turns: [...turns, { ...last, entries }] }
}

/**
 * Fold a whole log.
 * @param facts - every fact, in log order.
 * @returns the transcript they make.
 */
export function transcript(facts: readonly Fact[]): Transcript {
  return facts.reduce(fold, empty)
}
