/**
 * The facts a test feeds, built once for every test that feeds them: a
 * prompt, a tool call, and the result that answers it. A builder fixes what
 * no test varies — a call and its result sit in turn 1, step 1 — and takes
 * the rest as parameters, so a test's input reads where it is fed. What a
 * test asserts stays a literal in its test; these build inputs only.
 * @module binnacle/test/support/facts
 */
import type { Fact } from '../../src/facts/adapt.ts'

/**
 * A prompt: a line a person sent, as one text block.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @param text - what the person wrote.
 * @returns the prompt fact.
 */
export const prompt = (seq: number, time: number, text: string): Extract<Fact, { readonly kind: 'prompt' }> => ({
  kind: 'prompt', seq, time, blocks: [{ kind: 'text', text }],
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
  kind: 'call', seq, time, turn: 1, step: 1, callId, name, arguments: args,
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
  kind: 'result', seq, time, turn: 1, step: 1, callId, failed: false, blocks: [{ kind: 'text', text }], meta: undefined,
})
