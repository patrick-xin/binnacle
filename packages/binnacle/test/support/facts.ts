/**
 * The facts a test feeds, built once for every test that feeds them: a
 * prompt, a tool call, and the result that answers it. A builder fixes what
 * no test varies — a call and its result sit in turn 1, step 1 — and takes
 * the rest as parameters, so a test's input reads where it is fed. What a
 * test asserts stays a literal in its test; these build inputs only.
 * @module binnacle/test/support/facts
 */
import type { Fact } from '../../src/facts/adapt.ts'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { CommandId } from '@deepseek-ai/dsh-commands'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'

/**
 * A prompt: a line a person sent, as one text block.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param text - what the person wrote.
 * @returns the prompt fact.
 */
export const prompt = (seq: number, time: number, text: string): Extract<Fact, { readonly kind: 'prompt' }> => ({
  kind: 'prompt',
  seq,
  time,
  blocks: [{ kind: 'text', text }],
})

/**
 * A tool the model asked for, in turn 1, step 1.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param callId - the call's id, which its result names.
 * @param name - the tool.
 * @param args - the arguments, as the model wrote them.
 * @returns the call fact.
 */
export const call = (seq: number, time: number, callId: string, name: string, args: string): Extract<Fact, { readonly kind: 'call' }> => ({
  kind: 'call',
  seq,
  time,
  turn: 1,
  step: 1,
  callId,
  name,
  arguments: args,
})

/**
 * What a call returned, having succeeded: one text block, in turn 1, step 1.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param callId - the call it answers.
 * @param text - what the tool returned.
 * @returns the result fact.
 */
export const returned = (seq: number, time: number, callId: string, text: string): Extract<Fact, { readonly kind: 'result' }> => ({
  kind: 'result',
  seq,
  time,
  turn: 1,
  step: 1,
  callId,
  failed: false,
  blocks: [{ kind: 'text', text }],
  meta: undefined,
})

/**
 * An approval the agent asked for, as dsh logged it.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param id - dsh's id of the request, which its decision names.
 * @param toolName - the tool the question is about.
 * @param reason - why it asks; left out when the asker gave none.
 * @returns the asked fact.
 */
export const asked = (
  seq: number,
  time: number,
  id: string,
  toolName: string,
  reason?: string,
): Extract<Fact, { readonly kind: 'asked' }> => ({
  kind: 'asked',
  seq,
  time,
  id: ApprovalRequestId(id),
  toolName,
  ...(reason === undefined ? {} : { reason }),
})

/**
 * The decision that answered an approval, in dsh's words.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param id - dsh's id of the ask it answers.
 * @param outcome - what was decided.
 * @returns the decided fact.
 */
export const decided = (seq: number, time: number, id: string, outcome: ApprovalOutcome): Extract<Fact, { readonly kind: 'decided' }> => ({
  kind: 'decided',
  seq,
  time,
  id: ApprovalRequestId(id),
  outcome,
})

/**
 * A command that ran, as dsh logged it.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param commandId - dsh's id of the run, which its done names.
 * @param name - the command's name.
 * @param args - the text that followed the name; left out when the command's own event owns the payload.
 * @returns the run fact.
 */
export const run = (
  seq: number,
  time: number,
  commandId: string,
  name: string,
  args?: string,
): Extract<Fact, { readonly kind: 'run' }> => ({
  kind: 'run',
  seq,
  time,
  commandId: CommandId(commandId),
  name,
  source: 'user',
  ...(args === undefined ? {} : { args }),
})

/**
 * The done that settled a command, in dsh's words.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param commandId - dsh's id of the run it settles.
 * @param outcome - how the command settled.
 * @param text - what it returned; left out when it said nothing.
 * @returns the done fact.
 */
export const done = (
  seq: number,
  time: number,
  commandId: string,
  outcome: 'success' | 'error',
  text?: string,
): Extract<Fact, { readonly kind: 'done' }> => ({
  kind: 'done',
  seq,
  time,
  commandId: CommandId(commandId),
  outcome,
  ...(text === undefined ? {} : { text }),
})

/**
 * A compaction's start, as dsh logged it.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param compactionId - dsh's id of the compaction, which its summary and its end name.
 * @returns the start fact.
 */
export const started = (seq: number, time: number, compactionId: string): Extract<Fact, { readonly kind: 'start' }> => ({
  kind: 'start',
  seq,
  time,
  compactionId: CompactionId(compactionId),
})

/**
 * A compaction's summary: one text block.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param compactionId - dsh's id of the compaction it summarizes.
 * @param items - how many items it shadowed.
 * @param tokens - about how many tokens they held.
 * @param text - the summary itself.
 * @returns the summary fact.
 */
export const summarized = (
  seq: number,
  time: number,
  compactionId: string,
  items: number,
  tokens: number,
  text: string,
): Extract<Fact, { readonly kind: 'summary' }> => ({
  kind: 'summary',
  seq,
  time,
  compactionId: CompactionId(compactionId),
  items,
  tokens,
  blocks: [{ kind: 'text', text }],
})

/**
 * The end of a compaction, in dsh's words.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param compactionId - dsh's id of the compaction it ends.
 * @param error - why it failed; left out when it compacted.
 * @returns the end fact.
 */
export const ended = (seq: number, time: number, compactionId: string, error?: string): Extract<Fact, { readonly kind: 'end' }> => ({
  kind: 'end',
  seq,
  time,
  compactionId: CompactionId(compactionId),
  ...(error === undefined ? {} : { error }),
})
