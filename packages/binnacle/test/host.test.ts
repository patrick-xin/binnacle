import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Terminal } from '@earendil-works/pi-tui'
import xterm from '@xterm/headless'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
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

/**
 * A terminal that emulates one, as pi-tui's own tests do: what binnacle writes
 * lands in xterm's main screen and scrollback, or its alternate screen.
 */
class XtermTerminal extends FakeTerminal {
  readonly #xterm: InstanceType<typeof xterm.Terminal>
  readonly #columns: number
  readonly #rows: number
  constructor(columns: number, rows: number) {
    super()
    this.#columns = columns
    this.#rows = rows
    this.#xterm = new xterm.Terminal({ cols: columns, rows, allowProposedApi: true })
  }
  override write(data: string): void { super.write(data); this.#xterm.write(data) }
  override get columns(): number { return this.#columns }
  override get rows(): number { return this.#rows }
  /**
   * What the main screen holds, its scrollback first, once everything written has landed.
   * @returns each row, plain, with the empty rows under the last dropped.
   */
  async mainScreen(): Promise<string[]> {
    await new Promise<void>((resolve) => { this.#xterm.write('', resolve) })
    const buffer = this.#xterm.buffer.normal
    const rows = Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true).trimEnd() ?? '')
    while (rows.at(-1) === '') rows.pop()
    return rows
  }
  /**
   * Whether the alternate screen is showing.
   * @returns true when it is.
   */
  async onAlternateScreen(): Promise<boolean> {
    await new Promise<void>((resolve) => { this.#xterm.write('', resolve) })
    return this.#xterm.buffer.active.type === 'alternate'
  }
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
  get following(): boolean { return this.#listener !== undefined }
  send(text: string): void { this.sent.push(text) }
  async close(): Promise<void> { this.closed = true }
  log(event: SessionEvent): void { this.#listener?.(event) }
}

/** A person's line, as dsh logs it. */
const prompt = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

/** A kind binnacle has no adapter for, as dsh logs it. */
const seed = (seq: number): SessionEvent<'session/end-seed'> => ({ type: 'session/end-seed', seq: SessionSeq(seq), time: seq, data: {} })

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

/** A terminal that starts, then fails before it is ready, as one that cannot enter raw mode does. */
class FailingTerminal extends FakeTerminal {
  override start(onInput: (data: string) => void): void {
    super.start(onInput)
    throw new Error('stdin is not a terminal')
  }
}

/** Mount the host on a real Context with the launcher's facts and dsh's services named, and commit startup. */
async function mount(args: string[], session = new FakeSession(), open: () => Promise<OpenedSession> = async () => session, terminal = new FakeTerminal()) {
  const exits: number[] = []
  const out: string[] = []
  let ready: (() => void) | undefined
  cmdline.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  cmdline.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.terminal = () => terminal
  host.internals.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.open = open
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

test('the host provides the binnacle service, and a view an author registers draws on the screen', async () => {
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, terminal, commit } = await mount([], session)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' })) } })
  commit()
  await until(() => /drawn by an author/.test(terminal.written))
})

test('a view registered after its entries were drawn draws them again, and disposing it gives them back', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  commit()
  await until(() => /› fix the build/.test(terminal.written))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' })) } })
  await author
  await until(() => /drawn by an author/.test(terminal.written))
  terminal.written = ''
  await author.dispose()
  await until(() => /› fix the build/.test(terminal.written))
})

test('an adapter registered after its kind was logged reads what was logged, and disposing it gives that back to the fallback', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([seed(1)]))
  commit()
  await until(() => /\? session\/end-seed/.test(terminal.written))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.facts('session/end-seed', () => ({ name: 'seeded', data: {} }))
      plugin.binnacle.view('seeded', () => ({ kind: 'text', text: 'seeded from a fork' }))
    },
  })
  await author
  await until(() => /seeded from a fork/.test(terminal.written))
  terminal.written = ''
  await author.dispose()
  await until(() => /\? session\/end-seed/.test(terminal.written))
})

test('a session that cannot be opened is said, and the launcher asked to exit 1, drawing nothing', async () => {
  const { exits, out, terminal, commit } = await mount([], new FakeSession(), async () => { throw new Error('no key for deepseek') })
  commit()
  await settle()
  assert.deepEqual(out, ['binnacle: could not open a session on the default model: no key for deepseek\n'])
  assert.deepEqual(exits, [1])
  assert.equal(terminal.started, false)
})

test('a session that fails to close on ctrl+c still gives the terminal back, says why, and asks to exit 1', async () => {
  const session = new FakeSession()
  session.close = async () => { throw new Error('the agent did not stop') }
  const { terminal, exits, out, commit } = await mount([], session)
  commit()
  await settle()
  terminal.type('\x03')
  await settle()
  assert.equal(terminal.started, false)
  assert.deepEqual(out, ['binnacle: could not close the session: the agent did not stop\n'])
  assert.deepEqual(exits, [1])
})

test('a terminal that fails as it starts is given back, the session closed and unfollowed, and exit 1 asked', async () => {
  const session = new FakeSession()
  const { terminal, exits, out, commit } = await mount([], session, async () => session, new FailingTerminal())
  commit()
  await settle()
  assert.equal(terminal.started, false)
  assert.equal(session.following, false)
  assert.equal(session.closed, true)
  assert.deepEqual(out, ['binnacle: could not take the terminal: stdin is not a terminal\n'])
  assert.deepEqual(exits, [1])
})

test('an author invalidating its view draws its entries again on screen, without reading the log again', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([seed(1)]))
  let adapted = 0
  let word = 'seeded'
  let author: Context | undefined
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      author = plugin
      plugin.binnacle.facts('session/end-seed', () => { adapted++; return { name: 'seeded', data: {} } })
      plugin.binnacle.view('seeded', () => ({ kind: 'text', text: `${word} from a fork` }))
    },
  })
  commit()
  await until(() => /seeded from a fork/.test(terminal.written))
  const read = adapted
  word = 'grown'
  author?.binnacle.invalidate('seeded')
  await until(() => /grown from a fork/.test(terminal.written))
  assert.equal(adapted, read)
})

/** A tool the model asked for, as dsh logs it, named for its place in the log. */
const called = (seq: number, name: string): SessionEvent<'tool/call'> => ({
  type: 'tool/call', seq: SessionSeq(seq), time: seq, data: { turn: 1, step: 1, callId: ToolCallId(`c${seq}`), name, arguments: '{}' },
})

/** What a call returned, as dsh logs it. */
const returned = (seq: number, callSeq: number, text: string): SessionEvent<'tool/result'> => ({
  type: 'tool/result', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { turn: 1, step: 1, message: { role: 'tool', id: MessageId(`m${seq}`), source: { kind: 'tool', callId: ToolCallId(`c${callSeq}`) }, toolCallId: ToolCallId(`c${callSeq}`), content: [{ type: 'text', text }] } },
})

/** Twelve lines a person sent, taller together than the terminal. */
const twelve = Array.from({ length: 12 }, (_, index) => prompt(index + 1, `p${index + 1}`))

test('--tui-mode regular prints the session under what the shell printed, and neither a result nor a view registered after clears it', async () => {
  const terminal = new XtermTerminal(40, 8)
  terminal.write('$ dsh --profile binnacle\r\n')
  const session = new FakeSession(twelve)
  const { ctx, commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(() => /p12/.test(terminal.written))
  session.log(called(13, 'read'))
  await until(() => /running…/.test(terminal.written))
  session.log(returned(14, 13, 'the file'))
  await until(() => /the file/.test(terminal.written))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' })) } })
  await author
  session.log(prompt(15, 'p15'))
  await until(() => /drawn by an author/.test(terminal.written))
  const shown = await terminal.mainScreen()
  assert.equal(shown[0], '$ dsh --profile binnacle')
  assert.deepEqual(shown.filter(row => row.startsWith('› ')), twelve.map((_, index) => `› p${index + 1}`))
  assert.deepEqual(shown.filter(row => /read|the file|running|author/.test(row)), ['● read {}', 'the file', 'drawn by an author'])
})

test('ctrl+t switches screens both ways, and what is typed, what every entry drew, and ctrl+c come along', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  let calls = 0
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.view('prompt', (_, next) => { calls++; return next() }) } })
  commit()
  await until(() => /fix the build/.test(terminal.written))
  assert.equal(await terminal.onAlternateScreen(), true)
  terminal.type('hel')
  terminal.type('\x14')
  await settle()
  assert.equal(await terminal.onAlternateScreen(), false)
  assert.ok((await terminal.mainScreen()).includes('› fix the build'))
  terminal.type('lo')
  await settle()
  assert.ok((await terminal.mainScreen()).some(row => row.includes('hello')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
  terminal.type('\x14')
  assert.equal(await terminal.onAlternateScreen(), true)
  assert.equal(calls, 1)
  terminal.type('\x03')
  await settle()
  assert.equal(terminal.started, false)
  assert.deepEqual(exits, [0])
})

test('whichever screen a person quits from, the main screen is left holding the session, printed once', async () => {
  for (const [args, switches] of [[[], 0], [['--tui-mode', 'regular'], 1], [['--tui-mode', 'regular'], 2]] as const) {
    const terminal = new XtermTerminal(40, 8)
    const session = new FakeSession(twelve.slice(0, 3))
    const { commit } = await mount([...args], session, async () => session, terminal)
    commit()
    await until(() => /p3/.test(terminal.written))
    for (let turn = 0; turn < switches; turn++) {
      terminal.type('\x14')
      await settle()
    }
    session.log(prompt(4, 'p4'))
    await settle()
    terminal.type('\x03')
    await settle()
    assert.deepEqual((await terminal.mainScreen()).filter(row => row.startsWith('› ')), ['› p1', '› p2', '› p3', '› p4'], `${args.join(' ') || 'fullscreen'}, switched ${switches} times`)
  }
})
