/**
 * The session a test of the host fakes: it records what the host does with
 * it — what was sent, whether it was closed — and hands a test the log a real
 * session would have, event by event. The harness behind a real session is
 * dsh's, proven by `check:boot`.
 * @module binnacle/test/support/session
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { OpenedSession, SessionStands } from '../../src/host/session.ts'

/** A session that records what the host does with it; the harness behind it is dsh's, proven by `check:boot`. */
export class FakeSession implements OpenedSession {
  readonly model = 'deepseek/deepseek-v4'
  /** The agent whose session this stands in for: the scope its approvals are answered under. */
  readonly agent = {} as Agent
  readonly sent: string[] = []
  closed = false
  running = false
  interrupted = 0
  /** Where the session stands, as the host reads it; a test changes it and says so. */
  stands: SessionStands = { model: 'deepseek/deepseek-v4', running: false }
  #standsChanged: (() => void) | undefined
  /** The commands the session has and the skills a person may invoke, each name to its description, and each line run as a command. */
  readonly commands = new Map<string, string>()
  readonly skills = new Map<string, string>()
  readonly ran: string[] = []
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
  async offers(): Promise<readonly { readonly name: string, readonly description: string }[]> {
    return [...this.commands, ...this.skills].map(([name, description]) => ({ name, description }))
  }
  #offersChanged: (() => void) | undefined
  onOffers(listener: () => void): () => void {
    this.#offersChanged = listener
    return () => { this.#offersChanged = undefined }
  }
  /** Say that what `/` offers changed, as dsh does when a command or skill comes or goes. */
  offersChanged(): void { this.#offersChanged?.() }
  async command(line: string): Promise<boolean> {
    const name = /^\/(\S+)/.exec(line)?.[1]
    if (name === undefined || !this.commands.has(name)) return false
    this.ran.push(line)
    return true
  }
  async close(): Promise<void> { this.closed = true }
  log(event: SessionEvent): void { this.#listener?.(event) }
}
