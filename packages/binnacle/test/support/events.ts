/**
 * The dsh log events more than one test feeds, as dsh's own types hold
 * them. Built once, so a test's input reads where it is fed; the events one
 * test alone feeds stay in it.
 * @module binnacle/test/support/events
 */
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /** A kind only this test knows, as an out-of-tree plugin would declare one: a kind dsh does not know. */
    'test/marker': { readonly note?: string }
  }
}

/**
 * An event of a kind dsh does not know, as an out-of-tree plugin logs one: `test/marker`, with no data.
 * @param seq - its place in the log.
 * @param time - when it was logged.
 * @returns the event.
 */
export const seed = (seq: number, time: number): SessionEvent<'test/marker'> => ({
  type: 'test/marker',
  seq: SessionSeq(seq),
  time,
  data: {},
})

/**
 * A tool the model asked for, as dsh logs it: in turn 1, step 1, with no arguments, its call id taken from its place in the log.
 * @param seq - its place in the log, which also names the call.
 * @param name - the tool.
 * @returns the event.
 */
export const called = (seq: number, name: string): SessionEvent<'tool/call'> => ({
  type: 'tool/call',
  seq: SessionSeq(seq),
  time: seq,
  data: { turn: 1, step: 1, callId: ToolCallId(`c${seq}`), name, arguments: '{}' },
})
