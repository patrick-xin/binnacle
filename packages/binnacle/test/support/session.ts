/**
 * The session a test of the host fakes: it records what the host does with
 * it — what was sent, whether it was closed — and hands a test the log a real
 * session would have, event by event. The harness behind a real session is
 * dsh's, proven by `check:boot`.
 * @module binnacle/test/support/session
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { OpenedSession } from '../../src/host/session.ts'

/** A session that records what the host does with it; the harness behind it is dsh's, proven by `check:boot`. */
export class FakeSession implements OpenedSession {
  readonly sent: string[] = []
  closed = false
  /** Whether a turn runs, as the agent's status says it: a test changes it and says so. */
  running = false
  interrupted = 0
  /** The model the session last asked for, in its latest request header; none before its first request. A test changes it and says so. */
  asked: { readonly provider: string, readonly model: string } | undefined
  /** What dsh's session projections hold for the session, by key, as a snapshot hands them. A test changes it and says so. */
  projections: Readonly<Record<string, unknown>> = {}
  /** The agent whose session this stands in for, as dsh holds it, in the shape a drawing reads: the model it opened on, its status, its session's latest request header; and the scope its approvals are answered under. */
  readonly agent = Object.defineProperty({
    options: { provider: 'deepseek', model: 'deepseek-v4' },
    session: { requestHeader: () => this.asked === undefined ? undefined : { config: this.asked } },
  }, 'status', { get: () => this.running ? 'running' : 'idle' }) as unknown as Agent
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
  onStanding(listener: () => void): () => void {
    this.#standsChanged = listener
    return () => { this.#standsChanged = undefined }
  }
  readonly #projectionListeners = new Set<() => void>()
  /**
   * Hear dsh's session projections change, as their change feed says it.
   * @param listener - called at each change.
   * @returns a function that stops listening.
   */
  onProjections(listener: () => void): () => void {
    this.#projectionListeners.add(listener)
    return () => { this.#projectionListeners.delete(listener) }
  }
  /** Say that the projections changed, as dsh's change feed does after an event is committed. */
  projectionsChanged(): void { for (const listener of this.#projectionListeners) listener() }
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
