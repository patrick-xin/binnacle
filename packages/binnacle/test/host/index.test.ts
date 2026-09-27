import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { getKeybindings, stripTerminalSequences } from '@earendil-works/pi-tui'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { defineTool, ToolRuntime } from '@deepseek-ai/dsh-tools'
import * as host from '../../src/host/index.ts'
import type { OpenedSession } from '../../src/host/session.ts'
import { called, seed as seedEvent } from '../support/events.ts'
import { FakeSession } from '../support/session.ts'
import { FakeTerminal, FailingTerminal, XtermTerminal } from '../support/terminal.ts'

/** A person's line, as dsh logs it. */
const prompt = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

/** A kind binnacle has no adapter for, as dsh logs it, logged when it was. */
const seed = (seq: number): SessionEvent<'session/end-seed'> => seedEvent(seq, seq)

/** What was added to the context without the person typing it, as dsh logs it. */
const added = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'system-prompt' }, content: [{ type: 'text', text }] },
})

/** Let the host's pending promises settle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

/**
 * Wait until something holds, as pi-tui draws a frame when it next can, not when asked.
 * @param holds - the condition.
 * @param within - how long to wait, in milliseconds.
 * @throws when it does not hold in time.
 */
async function until(holds: () => boolean | Promise<boolean>, within = 2_000): Promise<void> {
  const deadline = Date.now() + within
  while (!await holds()) {
    if (Date.now() > deadline) throw new Error(`did not hold within ${within} ms`)
    await settle()
  }
}

/** Mount the host on a real Context with the launcher's facts and dsh's services named, and commit startup. */
async function mount(args: string[], session = new FakeSession(), open: () => Promise<OpenedSession> = async () => session, terminal = new FakeTerminal(), provide: (ctx: Context) => Promise<void> = async () => {}) {
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
  await provide(ctx)
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

test('--help prints the usage and the keys, and exits 0 without holding the terminal', async () => {
  const { exits, out, terminal } = await mount(['--help'])
  assert.match(out.join(''), /Usage: dsh --profile binnacle/)
  assert.match(out.join(''), /Keys:/)
  for (const named of ['shift+tab', 'tab, down', 'up', 'enter', 'escape', 'ctrl+c', 'ctrl+t']) assert.ok(out.join('').includes(named), named)
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

test('the host installs the one key table, so the composer reads binnacle\'s bindings beside pi-tui\'s own', async () => {
  const { commit } = await mount([])
  commit()
  await settle()
  const keys = getKeybindings()
  assert.equal(keys.matches('\x03', 'binnacle.quit'), true)
  assert.equal(keys.matches('\x14', 'binnacle.switchScreens'), true)
  assert.equal(keys.matches('\r', 'tui.input.submit'), true)
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
  const shown = (): string => stripTerminalSequences(terminal.written)
  await until(() => /› fix the build/.test(shown()))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' })) } })
  await author
  await until(() => /drawn by an author/.test(shown()))
  terminal.written = ''
  await author.dispose()
  await until(() => /› fix the build/.test(shown()))
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

test('a session\'s call draws its presented title', async () => {
  const session = new FakeSession([])
  const { terminal, commit } = await mount([], session, async () => session, new FakeTerminal(), async (ctx) => {
    await ctx.plugin(SystemPrompt, {})
    const tools = new ToolRuntime(ctx)
    tools.register(defineTool({
      name: 'read',
      description: 'Read a file.',
      parameters: { path: { type: 'string' } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      execute: async () => 'the file',
      presentCall: args => ({ card: 'generic', title: `Read ${args.path}` }),
    }))
  })
  commit()
  await settle()
  session.log({ type: 'tool/call', seq: SessionSeq(2), time: 2, data: { turn: 1, step: 1, callId: ToolCallId('c2'), name: 'read', arguments: '{"path":"src/api.ts"}' } })
  await until(() => /Read src\/api\.ts/.test(terminal.written))
  session.log(returned(3, 2, 'the file'))
  await until(() => /the file/.test(terminal.written))
  assert.equal(stripTerminalSequences(terminal.written).includes('● read'), false)
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

test('where the terminal reports holding and releasing a key, as pi-tui asks a kitty-protocol one to, ctrl+t switches once and ctrl+c asks to exit once', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(() => /fix the build/.test(terminal.written))
  for (const event of ['\x1b[116;5u', '\x1b[116;5:2u', '\x1b[116;5:2u', '\x1b[116;5:3u']) {
    terminal.type(event)
    await settle()
    assert.equal(await terminal.onAlternateScreen(), false, JSON.stringify(event))
  }
  terminal.type('\x1b[99;5u')
  terminal.type('\x1b[99;5:3u')
  await settle()
  assert.deepEqual(exits, [0])
})

test('shift+tab steps in from the composer, enter opens the focused fold, and a key keys does not answer reaches the composer typed', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([called(13, 'read'), returned(14, 13, 'w\nx\ny\nz')])
  const { session: sent, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'z'))
  terminal.type('x')
  await until(async () => !(await terminal.altScreen()).some(row => row.includes('▸')))
  terminal.type('\r')
  assert.deepEqual(sent.sent, ['x'])
})

test('on the alternate screen, focus brings what it is on into view as it moves up the session', async () => {
  const terminal = new XtermTerminal(40, 8)
  const logged: SessionEvent[] = []
  for (let entry = 1; entry <= 6; entry++) {
    const seq = entry * 2
    logged.push(called(seq, `read${entry}`), returned(seq + 1, seq, 'w\nx\ny\nz'))
  }
  const session = new FakeSession(logged)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  for (let entry = 5; entry >= 1; entry--) {
    terminal.type('\x1b[Z')
    await until(async () => {
      const rows = await terminal.altScreen()
      return rows[0]?.trim() === 'w' && rows[3]?.includes('▸ show 1 more line') === true && rows[4]?.includes(`read${entry + 1}`) === true
    })
  }
})

/** Six calls, each answer folded to four lines, taller together than the window. */
const folded = Array.from({ length: 6 }, (_, index) => {
  const seq = (index + 1) * 2
  return [called(seq, `read${index + 1}`), returned(seq + 1, seq, 'w\nx\ny\nz')]
}).flat()

test('on the fullscreen, focus scrolled away from the end is said on the last row, naming the key that jumps back, and only then', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession(folded)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  assert.equal((await terminal.altScreen()).some(row => row.includes('Jump to latest')), false)
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('↓ Jump to latest · end')))
  assert.ok(terminal.written.includes('\x1b[36m ↓ Jump to latest · end '), 'the label is drawn in the accent tone')
})

test('the key the label names brings the transcript\'s last line back, following again, and the label goes', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession(folded)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  assert.equal((await terminal.altScreen()).some(row => row.includes('Jump to latest')), false)
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('↓ Jump to latest · end')))
  terminal.type('\x1b[F')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.every(row => row.includes('Jump to latest') === false) && rows[4] === '… 1 more line'
  })
})

test('the label names whatever the one key table binds to jump to the end, so a rebinding is named', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession(folded)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('↓ Jump to latest · end')))
  try {
    getKeybindings().setUserBindings({ 'tui.altScreen.bottom': 'ctrl+end' })
    session.log(prompt(7, 'and the tests'))
    await until(async () => (await terminal.altScreen()).some(row => row.includes('↓ Jump to latest · ctrl+end')))
  } finally {
    getKeybindings().setUserBindings({})
  }
})

test('from the main screen, a fold in a printed entry opens on the fullscreen by key, in view and focused, and the main screen is as it was after switching back', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('… 1 more line')))
  const before = await terminal.mainScreen()
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.onAlternateScreen()) === true)
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'z'))
  terminal.type('\x14')
  await settle()
  const after = await terminal.mainScreen()
  assert.deepEqual(after, before)
  assert.equal(after.some(row => row.includes('▸')), false)
})

test('focus the main screen could not draw comes back with the fullscreen, drawn', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ fold to 3 lines')))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).includes('● read {}'))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === true)
  await settle()
  assert.deepEqual((await terminal.altScreen()).slice(0, 5), ['w', 'x', 'y', 'z', '▸ fold to 3 lines'])
})

test('focus the fullscreen gives back is brought into view, however far up the session it sits', async () => {
  const terminal = new XtermTerminal(40, 8)
  const logged: SessionEvent[] = []
  for (let entry = 1; entry <= 6; entry++) logged.push(called(entry * 2, `read${entry}`), returned(entry * 2 + 1, entry * 2, 'w\nx\ny\nz'))
  const session = new FakeSession(logged)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  for (let step = 0; step < 6; step++) terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen())[3]?.includes('▸ show 1 more line') === true)
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).includes('● read6 {}'))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === true && (await terminal.altScreen())[0] === 'w')
  assert.deepEqual((await terminal.altScreen()).slice(0, 5), ['w', 'x', 'y', '▸ show 1 more line', '● read2  ↓ Jump to latest · end'])
})

test('typing on the main screen forgets where focus was, so enter back on the fullscreen sends what was typed', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).includes('● read {}'))
  terminal.type('x')
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === true)
  terminal.type('\r')
  await settle()
  assert.deepEqual(session.sent, ['x'])
})

test('on the main screen, focus on something not yet printed stays there, drawn, and a fold not yet printed opens in place', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'one'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz'), called(4, 'stat'), added(5, 'a\nb')])
  const { commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('⋯ added by ')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('▸ show 2 more lines')))
  assert.equal(await terminal.onAlternateScreen(), false)
  terminal.type('\r')
  await until(async () => {
    const rows = await terminal.mainScreen()
    return rows.some(row => row.trim() === 'a') && rows.some(row => row.trim() === 'b')
  })
  const after = await terminal.mainScreen()
  assert.deepEqual(after.slice(0, 6), ['› one', '● read {}', 'w', 'x', 'y', '… 1 more line'])
  assert.deepEqual(after.slice(6, 12), ['● stat {}', '  running…', '⋯ added by system-prompt', 'a', 'b', '▸ fold it away'])
})
