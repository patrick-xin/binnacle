import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Terminal } from '@earendil-works/pi-tui'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import * as host from '../src/host/index.ts'
import type { OpenedSession } from '../src/host/session.ts'

/** A terminal that records what is written and lets a test type into it. */
class FakeTerminal implements Terminal {
  written = ''
  started = false
  #onInput: ((data: string) => void) | undefined
  start(onInput: (data: string) => void): void { this.started = true; this.#onInput = onInput }
  stop(): void { this.started = false }
  async drainInput(): Promise<void> {}
  write(data: string): void { this.written += data }
  get columns(): number { return 80 }
  get rows(): number { return 24 }
  get kittyProtocolActive(): boolean { return false }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  type(data: string): void { this.#onInput?.(data) }
}

/** A session that records what the host does with it; the harness behind it is dsh's, proven by `check:boot`. */
class FakeSession implements OpenedSession {
  readonly model = 'deepseek/deepseek-v4'
  readonly sent: string[] = []
  closed = false
  #listener: ((event: SessionEvent) => void) | undefined
  readonly #logged: SessionEvent[]
  constructor(logged: SessionEvent[] = []) { this.#logged = logged }
  follow(listener: (event: SessionEvent) => void): () => void {
    for (const event of this.#logged) listener(event)
    this.#listener = listener
    return () => { this.#listener = undefined }
  }
  send(text: string): void { this.sent.push(text) }
  async close(): Promise<void> { this.closed = true }
  log(event: SessionEvent): void { this.#listener?.(event) }
}

/** A person's line, as dsh logs it. */
const prompt = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

/** Let the host's pending promises settle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

/**
 * Wait until something holds, as pi-tui draws a frame when it next can, not when asked.
 * @param holds - the condition.
 * @param within - how long to wait, in milliseconds.
 * @throws when it does not hold in time.
 */
async function until(holds: () => boolean, within = 2_000): Promise<void> {
  const deadline = Date.now() + within
  while (!holds()) {
    if (Date.now() > deadline) throw new Error(`did not hold within ${within} ms`)
    await settle()
  }
}

/** Mount the host on a real Context with the launcher's facts and dsh's services named, and commit startup. */
async function mount(args: string[], session = new FakeSession()) {
  const exits: number[] = []
  const out: string[] = []
  let ready: (() => void) | undefined
  const terminal = new FakeTerminal()
  cmdline.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  cmdline.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.terminal = () => terminal
  host.internals.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.open = async () => session
  const ctx = new Context()
  provideCmdline(ctx, {
    args,
    exit: code => { exits.push(code) },
    ready: { onReady: listener => { ready = listener; return () => { ready = undefined } } },
  })
  ctx.provide('agents', {} as never)
  ctx.provide('agentDefaultModel', {} as never)
  const fiber = ctx.plugin(host)
  await fiber
  return { ctx, fiber, exits, out, terminal, session, commit: () => ready?.() }
}

test('the row is named binnacle and needs the command line, the agents and the default model', () => {
  assert.equal(host.name, 'binnacle')
  assert.deepEqual(host.inject, ['cmdlineArgs', 'agents', 'agentDefaultModel'])
})

test('--check opens a session on the default model once startup commits, reports it, closes it, and exits 0 drawing nothing', async () => {
  const { exits, out, terminal, session, commit } = await mount(['--check'])
  assert.deepEqual(exits, [])
  commit()
  await settle()
  assert.deepEqual(out, ['binnacle: ok (deepseek/deepseek-v4)\n'])
  assert.equal(session.closed, true)
  assert.deepEqual(exits, [0])
  assert.equal(terminal.started, false)
})

test('--help prints the usage and exits 0 without holding the terminal', async () => {
  const { exits, out, terminal } = await mount(['--help'])
  assert.match(out.join(''), /Usage: dsh --profile binnacle/)
  assert.deepEqual(exits, [0])
  assert.equal(terminal.started, false)
})

test('with no flag, the terminal is taken once startup commits, and draws what the session has logged and logs next', async () => {
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { terminal, commit } = await mount([], session)
  assert.equal(terminal.started, false)
  commit()
  await until(() => /fix the build/.test(terminal.written))
  assert.equal(terminal.started, true)
  session.log(prompt(2, 'and the tests'))
  await until(() => /and the tests/.test(terminal.written))
})

test('a line typed and entered is sent to the session', async () => {
  const { terminal, session, commit } = await mount([])
  commit()
  await settle()
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
})

test('ctrl+c gives the terminal back, closes the session, and asks to exit 0', async () => {
  const { terminal, exits, session, commit } = await mount([])
  commit()
  await settle()
  terminal.type('\x03')
  await settle()
  assert.equal(terminal.started, false)
  assert.equal(session.closed, true)
  assert.deepEqual(exits, [0])
})

test('disposing the row gives the terminal back, closes the session, and cancels a pending start', async () => {
  const drawn = await mount([])
  drawn.commit()
  await settle()
  await drawn.fiber.dispose()
  assert.equal(drawn.terminal.started, false)
  assert.equal(drawn.session.closed, true)

  const pending = await mount([])
  await pending.fiber.dispose()
  pending.commit()
  await settle()
  assert.equal(pending.terminal.started, false)
})
