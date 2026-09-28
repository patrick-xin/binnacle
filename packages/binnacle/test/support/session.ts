/**
 * The session a test of the host fakes: it records what the host does with
 * it — what was sent, whether it was closed — and hands a test the log a real
 * session would have, event by event. The harness behind a real session is
 * dsh's, proven by `check:boot`.
 * @module binnacle/test/support/session
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { OpenedSession } from '../../src/host/session.ts'

/** A session that records what the host does with it; the harness behind it is dsh's, proven by `check:boot`. */
export class FakeSession implements OpenedSession {
  readonly model = 'deepseek/deepseek-v4'
  readonly sent: string[] = []
  closed = false
  running = false
  interrupted = 0
  #listener: ((event: SessionEvent) => void) | undefined
  readonly #logged: SessionEvent[]
  constructor(logged: SessionEvent[] = []) { this.#logged = logged }
  follow(listener: (event: SessionEvent) => void): () => void {
    for (const event of this.#logged) listener(event)
    this.#listener = listener
    return () => { this.#listener = undefined }
  }
  get following(): boolean { return this.#listener !== undefined }
  send(text: string): void { this.sent.push(text) }
  interrupt(): void { this.interrupted += 1 }
  async close(): Promise<void> { this.closed = true }
  log(event: SessionEvent): void { this.#listener?.(event) }
}
