/**
 * The session a test of the host fakes: it records what the host does with
 * it — what was sent, whether it was closed — and hands a test the log a real
 * session would have, event by event. The harness behind a real session is
 * dsh's, proven by `check:boot`.
 * @module binnacle/test/support/session
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { OpenedSession, SessionStands } from '../../src/host/session.ts'

/** A session that records what the host does with it; the harness behind it is dsh's, proven by `check:boot`. */
export class FakeSession implements OpenedSession {
  readonly model = 'deepseek/deepseek-v4'
  readonly sent: string[] = []
  closed = false
  running = false
  interrupted = 0
  /** Where the session stands, as the host reads it; a test changes it and says so. */
  stands: SessionStands = { model: 'deepseek/deepseek-v4', running: false }
  #standsChanged: (() => void) | undefined
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
  standing(): SessionStands { return this.stands }
  onStanding(listener: () => void): () => void {
    this.#standsChanged = listener
    return () => { this.#standsChanged = undefined }
  }
  /** Say that where the session stands changed, as dsh does when a turn starts or tokens are counted. */
  standsChanged(): void { this.#standsChanged?.() }
  async close(): Promise<void> { this.closed = true }
  log(event: SessionEvent): void { this.#listener?.(event) }
}
