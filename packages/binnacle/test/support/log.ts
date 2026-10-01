/**
 * A real session's log, as a fixture: the machinery a real session logs,
 * which no hand-built fact list carries. One session recorded in a checkout
 * of this repository — a person asked it to read the README, and it did,
 * with glob, bash and read — kept whole as plain JSONL: the first line the
 * session header, each further line one event, trimmed of the streaming
 * replay and the provider's replay state, which no adapter reads, and
 * scrubbed of machine-local paths and of every session, message and call id.
 * What it draws is asserted by `test/views/screen.test.ts`.
 * @module binnacle/test/support/log
 */
import { readFileSync } from 'node:fs'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * The fixture's events, in log order, as dsh logged them.
 *
 * Each line is parsed where it enters: an event is an object whose `type` is
 * a string over a `data` object at a numeric `seq` and `time`, and nothing
 * else about it is checked — dsh's own reader did that when it wrote the log.
 * @returns the events, oldest first.
 */
export function logged(): SessionEvent[] {
  const text = readFileSync(new URL('../fixtures/session.v4.jsonl', import.meta.url), 'utf8')
  return text
    .split('\n')
    .filter(Boolean)
    .slice(1)
    .map((line) => eventOf(JSON.parse(line)))
}

/**
 * Read one line of the fixture as an event.
 * @param line - the parsed line.
 * @returns the event.
 * @throws when the line is not an event: the fixture was recorded wrong.
 */
function eventOf(line: unknown): SessionEvent {
  if (typeof line !== 'object' || line === null) throw new Error('a fixture line is no event')
  const { type, seq, time, data } = line as Record<string, unknown>
  if (typeof type !== 'string' || typeof seq !== 'number' || typeof time !== 'number' || typeof data !== 'object') {
    throw new Error(`a fixture line is no event: ${JSON.stringify(line).slice(0, 80)}`)
  }
  return line as SessionEvent
}
