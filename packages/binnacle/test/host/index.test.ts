import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import type { Events } from '@deepseek-ai/cordis'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { getKeybindings, stripTerminalSequences } from '@earendil-works/pi-tui'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { defineTool, ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as host from '../../src/host/index.ts'
import type { OpenedSession } from '../../src/host/session.ts'
import { called, seed as seedEvent } from '../support/events.ts'
import { FakeClock } from '../support/clock.ts'
import { FakeSession } from '../support/session.ts'
import { FakeTerminal, FailingTerminal, XtermTerminal } from '../support/terminal.ts'
import type { Node } from '../../src/api.ts'
import type { Fact } from '../../src/facts/adapt.ts'

/** A person's line, as dsh logs it. */
const prompt = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

/** A kind binnacle has no adapter for, as dsh logs it, logged when it was. */
const seed = (seq: number): SessionEvent<'test/marker'> => seedEvent(seq, seq)

/** What was added to the context without the person typing it, as dsh logs it: a tool change, which is the context the transcript still draws. */
const added = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
  data: {
    role: 'user', id: MessageId(`m${seq}`), source: { kind: 'system-prompt' },
    content: [{ type: 'text', text }, { type: 'tool-addition', toolName: 'bash' }],
  },
})

/** Let the host's pending promises settle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

/** A plugin that places a screen of its own, opened with f2, drawing what it is told. */
const placesAScreen = (ctx: Context, draw: (facts: readonly Fact[]) => Node, name = 'review') =>
  ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.screen(name, { key: 'f2', description: 'open the review', draw }) } })

/** A screen that names its rows, so what it drew is plain on the terminal. */
const namedRows = (count: number): (facts: readonly Fact[]) => Node => _facts => ({
  kind: 'stack',
  children: Array.from({ length: count }, (_, row) => ({ kind: 'text' as const, text: `screen ${row + 1}` })),
})

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
async function mount(args: string[], session = new FakeSession(), open: () => Promise<OpenedSession> = async () => session, terminal = new FakeTerminal(), provide: (ctx: Context) => Promise<void> = async () => {}, clock: { now(): number, after(ms: number, then: () => void): () => void } = new FakeClock()) {
  const exits: number[] = []
  const out: string[] = []
  // The launcher's readiness: every listener runs once, in one go, at the commit — as the real one does (`dsh:apps/cli/src/profile-boot.ts#createAppReady`).
  const listeners = new Set<() => void>()
  let committed = false
  cmdline.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  cmdline.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.terminal = () => terminal
  host.internals.stdout = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.stderr = { write: (chunk: string) => { out.push(chunk); return true } }
  host.internals.open = open
  host.internals.clock = clock
  const ctx = new Context()
  await provide(ctx)
  provideCmdline(ctx, {
    args,
    exit: code => { exits.push(code) },
    ready: {
      onReady: listener => {
        if (committed) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  })
  ctx.provide('agents', {} as never)
  // dsh's session projections, whose snapshot the real opening reads; the host's tests fake the session, so a stub answers the seam the row names.
  ctx.provide('sessionProjections', { snapshot: () => ({ values: {} }) } as never)
  // dsh's default model, which opening a session reads; the host's tests fake the session, so nothing here varies it.
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  // dsh's commands, which the row names; the host's tests fake the session, whose commands a test names, so nothing reads this.
  ctx.provide('commands', {} as never)
  const fiber = ctx.plugin(host)
  await fiber
  return { ctx, fiber, exits, out, terminal, session, commit: () => { committed = true; const run = [...listeners]; listeners.clear(); for (const listener of run) listener() } }
}

test('the row is named binnacle and needs the command line, the agents, the default model, the session projections and the commands', () => {
  assert.equal(host.name, 'binnacle')
  assert.deepEqual(host.inject, ['cmdlineArgs', 'agents', 'agentDefaultModel', 'sessionProjections', 'commands'])
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

test('a line that is blank, or only spaces, is not sent; the line after it is', async () => {
  const { terminal, session, commit } = await mount([])
  commit()
  await settle()
  terminal.type('\r')
  terminal.type('   ')
  terminal.type('\r')
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
})

test('a submitted line reaches the placement as the Editor hands it on, trimmed and a blank line included', async () => {
  const { ctx, terminal, commit } = await mount([])
  const seen: string[] = []
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('composer', { kind: 'composer', submit: (text) => { seen.push(text) } }) } })
  commit()
  await settle()
  terminal.type('\r')
  terminal.type('  ')
  terminal.type('hello')
  terminal.type('  ')
  terminal.type('\r')
  assert.deepEqual(seen, ['', 'hello'])
})

test('ctrl+c twice gives the terminal back, closes the session, and asks to exit 0', async () => {
  const { terminal, exits, session, commit } = await mount([])
  commit()
  await settle()
  terminal.type('\x03')
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

test('a theme an author registers after its entries were drawn draws them again, and disposing it gives them back', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  commit()
  const shown = (): string => stripTerminalSequences(terminal.written)
  await until(() => /› fix the build/.test(shown()))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.theme({ marks: { prompt: { glyph: '>' } } }) } })
  await author
  await until(() => /> fix the build/.test(shown()))
  terminal.written = ''
  await author.dispose()
  await until(() => /› fix the build/.test(shown()))
})

test('an adapter registered after its kind was logged reads what was logged, and disposing it gives that back to the fallback', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([seed(1)]))
  commit()
  await until(() => /\? test\/marker/.test(terminal.written))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.facts('test/marker', () => ({ name: 'seeded', data: {} }))
      plugin.binnacle.view('seeded', () => ({ kind: 'text', text: 'seeded from a fork' }))
    },
  })
  await author
  await until(() => /seeded from a fork/.test(terminal.written))
  terminal.written = ''
  await author.dispose()
  await until(() => /\? test\/marker/.test(terminal.written))
})

test('a quiet kind draws no line, and a view registered for the kind draws it again until its plugin is disposed', async () => {
  const ended: SessionEvent<'session/end-seed'> = { type: 'session/end-seed', seq: SessionSeq(2), time: 2, data: {} }
  const { ctx, terminal, commit } = await mount([], new FakeSession([ended]))
  commit()
  await settle()
  assert.equal(terminal.written.includes('session/end-seed'), false)
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.view('session/end-seed', entry => {
        const seq = entry.kind === 'quiet' ? entry.fact.seq : 0
        return { kind: 'text', text: `the seed ended at ${seq}` }
      })
    },
  })
  await author
  await until(() => /the seed ended at 2/.test(terminal.written))
  terminal.written = ''
  await author.dispose()
  await settle()
  assert.equal(terminal.written.includes('the seed ended at'), false)
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
      plugin.binnacle.facts('test/marker', () => { adapted++; return { name: 'seeded', data: {} } })
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

/** A command that ran, as dsh logs it: log-only, no turn around it. */
const ran = (seq: number, commandId: string, name: string): SessionEvent<'command/run'> => ({
  type: 'command/run', seq: SessionSeq(seq), time: seq,
  data: { commandId: CommandId(commandId), name, args: '', source: { kind: 'user' } },
})

/** The done that settled a command, as dsh logs it. */
const done = (seq: number, commandId: string, text: string): SessionEvent<'command/done'> => ({
  type: 'command/done', seq: SessionSeq(seq), time: seq,
  data: { commandId: CommandId(commandId), kind: 'success', text },
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
  await until(() => /running 0s/.test(terminal.written))
  session.log(returned(14, 13, 'the file'))
  await until(() => /the file/.test(terminal.written))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' })) } })
  await author
  session.log(prompt(15, 'p15'))
  await until(() => /drawn by an author/.test(terminal.written))
  const shown = await terminal.mainScreen()
  assert.equal(shown[0], '$ dsh --profile binnacle')
  assert.deepEqual(shown.filter(row => row.startsWith(' › ')), twelve.map((_, index) => ` › p${index + 1}`))
  assert.deepEqual(shown.filter(row => /read|the file|running|author/.test(row)), ['● read {}', 'the file', 'drawn by an author'])
})

test('on the main screen, a command run between turns draws once it settles, its result in place of running…, though no turn wraps it', async () => {
  const terminal = new XtermTerminal(40, 8)
  terminal.write('$ dsh --profile binnacle\r\n')
  const session = new FakeSession([
    { type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } },
    prompt(2, 'fix the build'),
    { type: 'turn/end', seq: SessionSeq(3), time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  const { commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('fix the build')))
  session.log(ran(4, 'cmd-1a2b3c4d-1', 'compact'))
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('running…')))
  session.log(done(5, 'cmd-1a2b3c4d-1', 'compacted: 12 messages'))
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('compacted: 12 messages')))
  const shown = await terminal.mainScreen()
  assert.equal(shown.some(row => row.includes('running…')), false)
  assert.ok(shown.some(row => row === '/compact'), 'the line the person typed heads the entry')
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
  assert.ok((await terminal.mainScreen()).includes(' › fix the build'))
  terminal.type('lo')
  await settle()
  assert.ok((await terminal.mainScreen()).some(row => row.includes('hello')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
  terminal.type('\x14')
  assert.equal(await terminal.onAlternateScreen(), true)
  assert.equal(calls, 1)
  terminal.type('\x03')
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
  terminal.type('\x03')
    await settle()
    assert.deepEqual((await terminal.mainScreen()).filter(row => row.startsWith(' › ')), [' › p1', ' › p2', ' › p3', ' › p4'], `${args.join(' ') || 'fullscreen'}, switched ${switches} times`)
  }
})

test('where the terminal reports holding and releasing a key, as pi-tui asks a kitty-protocol one to, ctrl+t switches once and ctrl+c pressed twice asks to exit once', async () => {
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
  // A press let go is one press: the first says a second quits, and the second quits, once.
  terminal.type('\x1b[99;5u')
  terminal.type('\x1b[99;5:3u')
  await settle()
  assert.deepEqual(exits, [])
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
  const terminal = new XtermTerminal(40, 9)
  const logged: SessionEvent[] = []
  for (let entry = 1; entry <= 6; entry++) {
    const seq = entry * 2
    logged.push(called(seq, `read${entry}`), returned(seq + 1, seq, `w${entry}\nx\ny\nz`))
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
      return rows[0] === `w${entry}` && rows[3]?.includes('▸ show 1 more line') === true
    })
  }
})

/** Six calls, each answer folded to four lines, taller together than the window. */
const folded = Array.from({ length: 6 }, (_, index) => {
  const seq = (index + 1) * 2
  return [called(seq, `read${index + 1}`), returned(seq + 1, seq, 'w\nx\ny\nz')]
}).flat()

test('on the fullscreen, focus scrolled away from the end is said on the last row, naming the key that jumps back, and only then', async () => {
  const terminal = new XtermTerminal(40, 9)
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

test('the jump label is drawn in the chrome an author\'s theme gives it', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.theme({ chrome: { jump: 'v' } }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('v Jump to latest · end')))
})

test('the key the label names brings the transcript\'s last line back, following again, and the label goes', async () => {
  const terminal = new XtermTerminal(40, 9)
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
  const terminal = new XtermTerminal(40, 9)
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
  const terminal = new XtermTerminal(40, 9)
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
  const terminal = new XtermTerminal(40, 9)
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
  const rows = await terminal.altScreen()
  assert.deepEqual(rows.slice(0, 4), ['w', 'x', 'y', '▸ show 1 more line'])
  assert.match(rows[4] ?? '', /Jump to latest/)
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
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('system-prompt · show 3 more')))
  assert.equal(await terminal.onAlternateScreen(), false)
  terminal.type('\r')
  await until(async () => {
    const rows = await terminal.mainScreen()
    return rows.some(row => row.trim() === 'a') && rows.some(row => row.trim() === 'b')
  })
  const after = await terminal.mainScreen()
  assert.deepEqual(after.slice(0, 9), ['', ' › one', '', '', '● read {}', 'w', 'x', 'y', '… 1 more line'])
  assert.deepEqual(after.slice(9, 18), ['', '● stat {}', '  running 0s', '', '▸ ⋯ added by system-prompt · fold it', 'away', 'a', 'b', '[tool-addition]'])
})

test('the key a plugin offers opens its screen in the transcript\'s place, the composer below it, and the same key returns the transcript as it was', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const before = await terminal.altScreen()
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('\x1bOQ')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('fix the build')) && rows.every(row => row.startsWith('screen ') === false)
  })
  assert.deepEqual(await terminal.altScreen(), before)
})

test('escape returns to the transcript as it was, its scroll and what it drew unchanged', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('read6')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  terminal.type('\x1b[5~')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('Jump to latest')))
  const scrolled = await terminal.altScreen()
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('\x1b')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('read6') === false) && rows.every(row => row.startsWith('screen ') === false)
  })
  assert.deepEqual(await terminal.altScreen(), scrolled)
})

test('from the main screen, the offered key opens its screen on the alternate screen, and closing returns to the main screen as it was', async () => {
  const terminal = new XtermTerminal(40, 9)
  terminal.write('$ dsh --profile binnacle\r\n')
  const session = new FakeSession([prompt(1, 'one'), prompt(2, 'two'), prompt(3, 'three')])
  const { ctx, commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('three')))
  const before = await terminal.mainScreen()
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.onAlternateScreen()) === true && (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).some(row => row.includes('three')))
  assert.deepEqual(await terminal.mainScreen(), before)
})

test('quitting answers on a placed screen, and the session is left printed plain, without it', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'one'), prompt(2, 'two'), prompt(3, 'three')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('three')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('\x03')
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [0])
  const left = await terminal.mainScreen()
  assert.deepEqual(left.filter(row => row.startsWith(' › ')), [' › one', ' › two', ' › three'])
  assert.equal(left.some(row => row.includes('screen ')), false)
})

test('disposing the plugin closes its screen if it is open, and takes back its key, which reaches the composer typed', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const fiber = await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  await fiber.dispose()
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('fix the build')) && rows.every(row => row.startsWith('screen ') === false)
  })
  terminal.type('\x1bOQ')
  await settle()
  assert.equal((await terminal.altScreen()).some(row => row.includes('fix the build')), true, 'the key no longer opens anything')
})

test('a screen whose drawing throws draws what went wrong, naming its registration, and the surface stays up', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, () => { throw new Error('no phone') })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('✗ binnacle.screen(review) threw: no')))
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'phone'))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('still here')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['still here'])
})

test('an open placed screen scrolls with the keys the alternate screen answers, from its top', async () => {
  const terminal = new XtermTerminal(40, 15)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(30))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 11).every(row => row.startsWith('screen ')))
  assert.equal((await terminal.altScreen())[0], 'screen 1', 'a placed screen opens from its top')
  terminal.type('\x1b[6~')
  await until(async () => (await terminal.altScreen())[0] === 'screen 8')
  terminal.type('\x1b[H')
  await until(async () => (await terminal.altScreen())[0] === 'screen 1')
})

test('the composer below an open placed screen stays live: a line typed and entered is sent', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('note')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['note'])
  assert.equal((await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')), true, 'the screen stays open')
})

test('leaving the alternate screen closes a placed screen open on it, and the transcript returns', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false)
  await until(async () => {
    const rows = await terminal.mainScreen()
    return rows.some(row => row.includes('fix the build')) && rows.every(row => row.startsWith('screen ') === false)
  })
  terminal.type('\x14')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('fix the build')) && rows.every(row => row.startsWith('screen ') === false)
  }, 4000)
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every(row => row.startsWith('screen ')))
})

/** The session the Trajectory is read over: machinery, then one turn that asks and is answered. */
const trajectorySession = (): SessionEvent[] => [
  seed(0),
  { type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } },
  prompt(2, 'fix the build'),
  { type: 'turn/end', seq: SessionSeq(3), time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
]

/** The row a click lands on, as the SGR mouse protocol reports it: 1-based. */
const click = (terminal: XtermTerminal, column: number, row: number): void => {
  terminal.type(`\x1b[<0;${column};${row}M`)
  terminal.type(`\x1b[<0;${column};${row}m`)
}

test('a click on a line opens it to its record, and the composer below stays live', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('before turn 1')))
  click(terminal, 3, 2)
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === '"type": "test/marker",'))
  const opened = await terminal.altScreen()
  assert.ok(opened.some(row => row.includes('0 ? test/marker')))
  assert.ok(opened.some(row => row.trim() === '"data": {}'))
  terminal.type('note')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['note'])
})

test('enter opens the line a person focused, and focus reaches the screen from the composer by shift+tab', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('before turn 1')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ 3 turn 1 ended') && row.includes('· show')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === '"kind": "turn",'))
})

test('the trajectory follows a live session: an event logged while it is open draws its line', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('3 turn 1 ended · completed')))
  session.log(seed(4))
  await until(async () => (await terminal.altScreen()).some(row => row.includes('4 ? test/marker')))
})

test('ctrl+o opens the trajectory, one line per event with the machinery in it, and escape returns the transcript as it was', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('before turn 1')) && rows.some(row => row.includes('0 ? test/marker'))
  })
  const opened = await terminal.altScreen()
  assert.ok(opened.some(row => row.includes('1 turn 1 begins')))
  assert.ok(opened.some(row => row.includes('2 › fix the build')))
  assert.ok(opened.some(row => row.includes('3 turn 1 ended · completed')))
  terminal.type('\x1b')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('fix the build')) && rows.every(row => row.includes('turn 1 begins') === false)
  })
})

/** A plugin that places lines in a slot, drawing what it is told. */
const placesLines = (ctx: Context, slot: 'above-composer' | 'below-composer', text: string) =>
  ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place(slot, { kind: 'lines', draw: () => ({ kind: 'text', text }) }) } })

test('a line placed below the composer is drawn under it on the alternate screen, and disposing its plugin takes it back', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const author = placesLines(ctx, 'below-composer', 'the status')
  await author
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  assert.deepEqual((await terminal.altScreen()).slice(-5), ['─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4', 'the status'])
  await author.dispose()
  await until(async () => (await terminal.altScreen()).every(row => row !== 'the status'))
  assert.deepEqual((await terminal.altScreen()).slice(-4), ['─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4'])
})

test('on the main screen, a line placed below the composer is printed under it', async () => {
  const terminal = new XtermTerminal(40, 8)
  terminal.write('$ dsh --profile binnacle\r\n')
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  await placesLines(ctx, 'below-composer', 'the status')
  commit()
  await until(async () => (await terminal.mainScreen()).some(row => row.includes('the status')))
  assert.deepEqual(await terminal.mainScreen(), ['$ dsh --profile binnacle', '', ' › fix the build', '', '─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4', 'the status'])
})

test('a line placed above the composer is drawn between the transcript and the composer', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesLines(ctx, 'above-composer', 'a hint')
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('a hint')))
  assert.deepEqual((await terminal.altScreen()).slice(-5), ['a hint', '─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4'])
})

test('two lines placed in one slot are drawn oldest first', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesLines(ctx, 'below-composer', 'placed first')
  await placesLines(ctx, 'below-composer', 'placed second')
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('placed second')))
  assert.deepEqual((await terminal.altScreen()).slice(-2), ['placed first', 'placed second'])
})

test('a line placed below the composer is drawn again as facts arrive', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('below-composer', { kind: 'lines', draw: facts => ({ kind: 'text', text: `${facts.length} facts` }) }) } })
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === '1 facts')
  session.log(prompt(2, 'and the tests'))
  await until(async () => (await terminal.altScreen()).at(-1) === '2 facts')
})

test('with lines in the composer\'s place, what is typed is sent nowhere, and ctrl+c still quits', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('composer', { kind: 'lines', draw: () => ({ kind: 'text', text: 'read only' }) }) } })
  commit()
  await until(async () => (await terminal.altScreen()).at(-2) === 'read only')
  assert.equal((await terminal.altScreen()).some(row => row === '─'.repeat(40)), false)
  terminal.type('hello')
  terminal.type('\r')
  await settle()
  assert.deepEqual(session.sent, [])
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length > 0)
  assert.deepEqual(exits, [0])
})

test('lines placed in the composer\'s place after it is drawn take it, and disposing them gives the composer back, typing and all', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-2) === '─'.repeat(40))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.place('composer', { kind: 'lines', draw: () => ({ kind: 'text', text: 'read only' }) }) } })
  await author
  await until(async () => (await terminal.altScreen()).at(-2) === 'read only')
  await author.dispose()
  await until(async () => (await terminal.altScreen()).at(-2) === '─'.repeat(40))
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
})

test('lines whose drawing throws draw what went wrong, naming their registration, and the surface stays up', async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('below-composer', { kind: 'lines', draw: () => { throw new Error('no model') } }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  await until(async () => (await terminal.altScreen()).at(-1) === '✗ binnacle.place(below-composer) threw: no model')
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
})

test('one placement in two slots is named by each slot when it goes wrong, not by the first alone', async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const placement = { kind: 'lines' as const, draw: (): Node => { throw new Error('no model') } }
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('above-composer', placement); author.binnacle.place('below-composer', placement) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const rows = await terminal.altScreen()
  assert.ok(rows.some(row => row.trim() === '✗ binnacle.place(above-composer) threw: no model'), 'the line above names its own registration')
  assert.ok(rows.some(row => row.trim() === '✗ binnacle.place(below-composer) threw: no model'), 'the line below names its own registration')
})

test('out of the box, the line under the composer names the model the session runs, muted', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  assert.equal((await terminal.altScreen()).at(-1), 'deepseek/deepseek-v4')
  assert.ok(terminal.written.includes('\x1b[90mdeepseek/deepseek-v4\x1b[39m'), 'the model is drawn in the muted tone')
})

test('the line names the model the session runs, and follows it as the session stands elsewhere', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  session.stands = { model: 'moonshot/kimi-k2', running: true }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'moonshot/kimi-k2')
})

test('the line names the tokens the session used and the share of its context, each as it is measured', async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  session.stands = { model: 'deepseek/deepseek-v4', running: false, usage: { input: 12_000, output: 400, cacheRead: 0 } }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4 · 12.4k tokens')
  session.stands = { model: 'deepseek/deepseek-v4', running: false, usage: { input: 12_000, output: 400, cacheRead: 0 }, context: { used: 12_400, window: 32_768 } }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4 · 12.4k tokens · 38% of context')
})

test('a notice stands in the line\'s place while one stands, and the line returns once it goes', async () => {
  const terminal = new XtermTerminal(50, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  terminal.type('\x03')
  await until(async () => (await terminal.altScreen()).at(-1) === 'ctrl+c again to quit')
  assert.ok(terminal.written.includes('\x1b[90mctrl+c again to quit\x1b[39m'), 'the notice is drawn in the muted tone')
  clock.advance(3_000)
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
})

test('lines a plugin places that say the time since a moment count up as it passes', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('below-composer', { kind: 'lines', draw: () => ({ kind: 'text', text: ['elapsed ', { since: 1_000 }] }) }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'elapsed 0s'))
  clock.advance(4_000)
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'elapsed 3s'))
})

test('a screen a plugin places that says the time since a moment counts up as it passes, open', async () => {
  const terminal = new XtermTerminal(40, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  await placesAScreen(ctx, () => ({ kind: 'text', text: ['up ', { since: 0 }] }))
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'up 0s'))
  clock.advance(2_000)
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'up 2s'))
})

test('a quit key a plugin rebinds quits, and the key it had no longer does', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'binnacle.quit': 'ctrl+q' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [])
  terminal.type('\x11')
  terminal.type('\x11')
  await until(() => exits.length > 0)
  assert.deepEqual(exits, [0])
})

test('a pi-tui binding a plugin rebinds reaches the composer: a line is sent with the key submit is bound to', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'tui.input.submit': 'ctrl+s' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, [])
  terminal.type('\x13')
  assert.deepEqual(session.sent, ['hello'])
})

test('a placed screen opens with the key a plugin rebinds it to, and no longer with its own', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'binnacle.screen.trajectory': 'f2' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x0f')
  await settle()
  assert.equal((await terminal.altScreen()).some(row => row.includes('before turn 1')), false)
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('before turn 1')))
})

test('disposing the plugin that rebound quit gives ctrl+c back', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const author = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (plugin: Context) => { plugin.binnacle.keys({ 'binnacle.quit': 'ctrl+q' }) } })
  await author
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [])
  await author.dispose()
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length > 0)
  assert.deepEqual(exits, [0])
})

test('a key a plugin binds to expand opens the focused fold, and one bound to copy does nothing on a fold, which offers no copy', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([called(13, 'read'), returned(14, 13, 'w\nx\ny\nz')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'binnacle.expand': 'f6', 'binnacle.copy': 'f7' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('▸ show 1 more line')))
  const focused = await terminal.altScreen()
  terminal.type('\x1b[18~')
  await settle()
  assert.deepEqual(await terminal.altScreen(), focused)
  terminal.type('\x1b[17~')
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'z'))
})

test('--help says Ctrl+C stops a running turn and quits only when pressed twice', async () => {
  const { out } = await mount(['--help'])
  assert.match(out.join(''), /Ctrl\+C stops a\s+running turn, and twice quits\./)
  assert.match(out.join(''), /\n  ctrl\+c  stop a running turn; pressed twice, quit\n/)
})

test('--help names each affordance\'s binding, unbound until a person binds it', async () => {
  const { out } = await mount(['--help'])
  assert.match(out.join(''), /  \(unbound\)  copy the focused thing\n/)
})

test('a plugin\'s composer placement decides what a submitted line does', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const seen: string[] = []
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('composer', { kind: 'composer', submit: (text) => { seen.push(text.toUpperCase()) } }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(seen, ['HELLO'])
  assert.deepEqual(session.sent, [])
})

test('escape interrupts a running turn while nothing has focus, and while nothing runs reaches the composer', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  session.running = true
  terminal.type('\x1b')
  assert.equal(session.interrupted, 1)
  session.running = false
  terminal.type('\x1b')
  terminal.type('hi')
  terminal.type('\r')
  assert.equal(session.interrupted, 1)
  assert.deepEqual(session.sent, ['hi'])
})

test('lines in the composer\'s seat that offer something take the keyboard: enter invokes the first offer, which reaches their invoke, and nothing is sent', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const invoked: string[] = []
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('composer', {
        kind: 'lines',
        draw: () => ({ kind: 'stack', children: [
          { kind: 'offer', id: 'allow', affordances: [{ kind: 'grant', label: 'allow once' }], child: { kind: 'text', text: 'allow once' } },
          { kind: 'offer', id: 'reject', affordances: [{ kind: 'dismiss', label: 'reject' }], child: { kind: 'text', text: 'reject' } },
        ] }),
        invoke: (region, affordance) => { invoked.push(`${region} ${affordance}`) },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('allow once')))
  terminal.type('\r')
  assert.deepEqual(invoked, ['allow grant'])
  terminal.type('\t')
  terminal.type('\r')
  assert.deepEqual(invoked, ['allow grant', 'reject dismiss'])
  assert.deepEqual(session.sent, [])
})

/**
 * Ask for approval as dsh's approval service does: down the \`approval/request\` waterfall, failing closed to \`unavailable\` when nothing answers.
 * @param ctx - the context the answerers are on.
 * @param req - what is asked.
 * @returns the outcome an answerer settled.
 */
const askApproval = (ctx: Context, req: Omit<Parameters<Events['approval/request']>[0], 'agent'>): Promise<ApprovalOutcome> =>
  ctx.waterfall('approval/request', { agent: {} as never, ...req }, () => Promise.resolve<ApprovalOutcome>('unavailable'))

/**
 * Ask for approval as dsh's approval service does: down the `approval/request` waterfall, scope-filtered to the agent that asks (`dsh:packages/core/scope/src/index.ts#scopeTarget`), failing closed to `unavailable` when nothing answers.
 * @param ctx - the context the answerers are on.
 * @param agent - the agent asking, whose scope the dispatch is tagged with.
 * @param req - what is asked.
 * @returns the outcome an answerer settled.
 */
const askApprovalFor = (ctx: Context, agent: Agent, req: Omit<Parameters<Events['approval/request']>[0], 'agent'>): Promise<ApprovalOutcome> =>
  ctx.waterfall(scopeTarget(agent, agent), 'approval/request', { agent: {} as never, ...req }, () => Promise.resolve<ApprovalOutcome>('unavailable'))

test('an approval another agent asks is not binnacle\'s to answer: no card seats, and it settles as nothing answered', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const foreign = {} as Agent
  const outcome = askApprovalFor(ctx, foreign, { toolName: 'bash', reason: 'another agent asks' })
  await settle()
  assert.ok((await terminal.altScreen()).every(row => !row.includes('another agent asks')), 'another agent\'s ask seats no card')
  assert.equal(await Promise.race([outcome, settle().then(() => 'still standing' as const)]), 'unavailable', 'another agent\'s ask settles as nothing answered')
  // The session\'s own agent is still answered, asked the same scoped way.
  const mine = askApprovalFor(ctx, session.agent, { toolName: 'bash', reason: 'the session asks' })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('the session asks')))
  terminal.type('\r')
  assert.equal(await mine, 'allowed-once')
})

test('an approval asked sits in the composer\'s seat, naming the tool and why, and enter allows it once, giving the composer back', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('draft')
  const outcome = askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('writes outside the workspace')))
  const card = await terminal.altScreen()
  assert.ok(card.some(row => row.includes('bash asks')), 'the card names the tool')
  assert.ok(card.some(row => row.includes('allow once')) && card.some(row => row.includes('reject')), 'the card offers both')
  terminal.type('\r')
  assert.equal(await outcome, 'allowed-once')
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('writes outside the workspace')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['draft'])
})

test('a click on the card does nothing, allow once or reject: an approval is a key pressed on purpose; tab and enter reject', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => { settled = outcome })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('allow once')))
  const rows = await terminal.altScreen()
  // The pointer reports a cell 1-based, where the rows read back are 0-based.
  for (const offer of ['allow once', 'reject']) {
    const row = rows.findIndex(line => line.includes(offer))
    click(terminal, (rows[row]?.indexOf(offer) ?? 0) + 1, row + 1)
    await settle()
    assert.equal(settled, undefined, `a click on ${offer} settled nothing`)
  }
  terminal.type('\t')
  terminal.type('\r')
  await until(() => settled !== undefined)
  assert.equal(settled, 'rejected')
})

test('an approval still standing when the session closes settles unavailable, and its card is gone from what it left', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => { settled = outcome })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('allow once')))
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => settled !== undefined)
  assert.equal(settled, 'unavailable')
  await settle()
  assert.deepEqual(exits, [0])
  assert.ok((await terminal.mainScreen()).every(row => !row.includes('allow once')), 'the card is gone from what the session left printed')
})

test('an approval withdrawn by its signal takes its card back, settled cancelled', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const withdraw = new AbortController()
  const outcome = askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace', signal: withdraw.signal })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('allow once')))
  withdraw.abort()
  assert.equal(await outcome, 'cancelled')
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('allow once')))
})

test('the key a person binds to dismiss rejects an approval while allow once has focus', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'binnacle.dismiss': 'f8' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => { settled = outcome })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('allow once')))
  terminal.type('\x1b[19~')
  await until(() => settled !== undefined)
  assert.equal(settled, 'rejected')
})

/**
 * Ask a question as dsh's user-questions service does for the session's agent: down the `user-questions/request` waterfall, scope-filtered to the agent that asks (`dsh:packages/core/scope/src/index.ts#scopeTarget`), failing with `NO_PROVIDER` when nothing answers.
 * @param ctx - the context the answerers are on.
 * @param agent - the agent asking, whose scope the dispatch is tagged with.
 * @param req - what is asked.
 * @returns the answer an answerer settled, or the rejection it was refused with.
 */
const askQuestionsFor = (ctx: Context, agent: Agent, req: Omit<Parameters<Events['user-questions/request']>[0], 'agent'>): Promise<AskUserQuestionAnswer> =>
  ctx.waterfall(scopeTarget(agent, agent), 'user-questions/request', { agent, ...req }, () => Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')))

test('a question another agent asks is not binnacle\'s to answer: no card seats, and it fails as nothing answered', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const foreign = {} as Agent
  const answer = askQuestionsFor(ctx, foreign, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  const refusal = await answer.then(() => undefined, (reason: unknown) => reason)
  await settle()
  assert.ok((await terminal.altScreen()).every(row => !row.includes('which database?')), 'another agent\'s question seats no card')
assert.equal(refusal instanceof Error && refusal.name === 'UserQuestionError' && (refusal as { code?: string }).code === 'NO_PROVIDER', true, 'another agent\'s ask fails as nothing answered')
  // The session\'s own agent is still answered, asked the same scoped way.
  const mine = askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q2', question: 'which port?', options: [{ label: '5432' }] }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which port?')))
  terminal.type('\r')
  assert.deepEqual(await mine, { answers: [{ id: 'q2', selected: ['5432'] }] })
})

test('a question asked sits in the composer\'s seat, naming the question, and enter chooses its first option, answering it', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{
    id: 'q1',
    header: 'Set up',
    question: 'which database?',
    detail: 'The workspace has no database yet.',
    options: [{ label: 'postgres' }, { label: 'sqlite' }],
  }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  const card = await terminal.altScreen()
  assert.ok(card.some(row => row.includes('Set up')), 'the card titles itself with the header')
  assert.ok(card.some(row => row.includes('The workspace has no database yet.')), 'the card draws the detail')
  assert.ok(card.some(row => row.includes('postgres')) && card.some(row => row.includes('sqlite')), 'the card offers both options')
  assert.ok(card.some(row => row.includes('type an answer')) && card.some(row => row.includes('skip')) && card.some(row => row.includes('cancel')), 'the card offers typing, skipping and cancelling')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['postgres'] }] })
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))
})

test('skip answers a question with nothing selected, and the next question takes the seat', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [
    { id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] },
    { id: 'q2', question: 'which port?', options: [{ label: '5432' }, { label: '8080' }] },
  ] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which port?')))
  assert.ok((await terminal.altScreen()).every(row => !row.includes('which database?')), 'the first question\'s card is gone')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [
    { id: 'q1', selected: [] },
    { id: 'q2', selected: ['5432'] },
  ] })
})

test('a multi-select question answers with every option marked, once done is chosen', async () => {
  const terminal = new XtermTerminal(50, 18)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{
    id: 'q1',
    question: 'which checks should run?',
    multiSelect: true,
    options: [{ label: 'types' }, { label: 'lint' }, { label: 'tests' }],
  }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which checks should run?')))
  assert.ok((await terminal.altScreen()).some(row => row.includes('done')), 'a multi-select question offers done')
  terminal.type('\r')
  // The marked option's line draws the done mark beside its label.
  await until(async () => (await terminal.altScreen()).some(row => row.includes('● types')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('● tests')))
  terminal.type('\t')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['types', 'tests'] }] })
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which checks should run?')))
})

test('type an answer places a composer in the seat, whose submitted line is the custom answer; a blank line gives the card back', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  assert.ok((await terminal.altScreen()).some(row => row.includes('skip')), 'the card is back')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  terminal.type('whatever runs')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('whatever runs')))
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'whatever runs' }] })
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))
})

test('cancel rejects the request as cancelled, and the composer returns with what was typed', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.keys({ 'binnacle.dismiss': 'f8' }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('draft')
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  terminal.type('\x1b[19~')
  const refusal = await answer.then(() => undefined, (reason: unknown) => reason)
  assert.equal(refusal instanceof Error && refusal.name === 'UserQuestionError', true, 'the refusal is a UserQuestionError')
  assert.equal((refusal as { code?: string }).code, 'ASK_CANCELLED')
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['draft'])
})

test('a request withdrawn by its signal takes its card back, rejected as aborted', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const withdraw = new AbortController()
  const answer = askQuestionsFor(ctx, session.agent, { signal: withdraw.signal, questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  withdraw.abort()
  const refusal = await answer.then(() => undefined, (reason: unknown) => reason)
  assert.equal(refusal instanceof Error && refusal.name === 'UserQuestionError', true, 'the refusal is a UserQuestionError')
  assert.equal((refusal as { code?: string }).code, 'ASK_ABORTED')
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))
})

test('a request already withdrawn when it arrives seats nothing and is rejected as aborted', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const withdraw = new AbortController()
  withdraw.abort()
  const answer = askQuestionsFor(ctx, session.agent, { signal: withdraw.signal, questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  const refusal = await answer.then(() => undefined, (reason: unknown) => reason)
  assert.equal((refusal as { code?: string }).code, 'ASK_ABORTED')
  await settle()
  assert.ok((await terminal.altScreen()).every(row => !row.includes('which database?')), 'no card was seated')
})

test('a plan-review question is drawn the same way, its plan as markdown and its approve option primary', async () => {
  const terminal = new XtermTerminal(50, 18)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{
    id: 'q1',
    header: 'Plan review',
    question: 'does this plan do it?',
    detail: '## The plan\n\n1. read the code\n2. write the test',
    intent: { kind: 'plan-review', approve: 'ship it' },
    options: [{ label: 'rethink it' }, { label: 'ship it' }],
  }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('does this plan do it?')))
  const card = await terminal.altScreen()
  assert.ok(card.some(row => row.includes('The plan')), 'the card draws the plan')
  assert.ok(card.some(row => row.includes('read the code')), 'the plan\'s steps are drawn')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['ship it'] }] })
})

test('while the composer holds the seat the question stays readable above it, asked once, offering nothing', async () => {
  const terminal = new XtermTerminal(50, 20)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{
    id: 'q1',
    header: 'Set up',
    question: 'which database?',
    detail: 'The workspace has no database yet.',
    options: [{ label: 'postgres' }, { label: 'sqlite' }],
  }] })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('which database?')) && rows.some(row => row.includes('The workspace has no database yet.')) && rows.every(row => !row.includes('skip'))
  })
  assert.equal((await terminal.altScreen()).filter(row => row.includes('which database?')).length, 1, 'the question is asked once')
  terminal.type('whatever runs')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'whatever runs' }] })
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))
  terminal.type('\r')
  assert.deepEqual(session.sent, [], 'the line answered the question; nothing was sent')
})

test('a click on a question\'s option chooses it, and a click on cancel cancels nothing, for dismiss refuses the pointer', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  let settled: AskUserQuestionAnswer | undefined
  void askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] }] }).then((answer) => { settled = answer })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  const rows = await terminal.altScreen()
  const optionRow = rows.findIndex(line => line.includes('postgres'))
  click(terminal, (rows[optionRow]?.indexOf('postgres') ?? 0) + 1, optionRow + 1)
  await until(() => settled !== undefined)
  assert.deepEqual(settled, { answers: [{ id: 'q1', selected: ['postgres'] }] })
  await until(async () => (await terminal.altScreen()).every(row => !row.includes('which database?')))

  let refused: unknown
  void askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q2', question: 'which port?', options: [{ label: '5432' }] }] }).then(() => {}, (reason: unknown) => { refused = reason })
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which port?')))
  const asking = await terminal.altScreen()
  const cancelRow = asking.findIndex(line => line.includes('cancel'))
  click(terminal, (asking[cancelRow]?.indexOf('cancel') ?? 0) + 1, cancelRow + 1)
  await settle()
  assert.ok(refused === undefined, 'a click on cancel cancels nothing')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(() => refused !== undefined)
  const reason: unknown = refused
  assert.equal(reason instanceof Error && reason.name === 'UserQuestionError' && (reason as { code?: string }).code === 'ASK_CANCELLED', true, 'tab and enter cancel the ask')
})

test('an ask still standing when the session closes goes to the next answerer, and its card is gone from what it left', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  const refusal = answer.then(() => undefined, (reason: unknown) => reason)
  await until(async () => (await terminal.altScreen()).some(row => row.includes('which database?')))
  terminal.type('\x03')
  terminal.type('\x03')
  const reason = await refusal
  assert.equal(reason instanceof Error && reason.name === 'UserQuestionError' && (reason as { code?: string }).code === 'NO_PROVIDER', true, 'the ask went to the next answerer, and none answered')
  await settle()
  assert.deepEqual(exits, [0])
  assert.ok((await terminal.mainScreen()).every(row => !row.includes('which database?')), 'the card is gone from what the session left printed')
})

test('lines are handed where the session stands, and are drawn again as it changes', async () => {
  const terminal = new XtermTerminal(60, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', { kind: 'lines', draw: (_facts, surface) => ({ kind: 'text', text: `${surface.model} ${surface.running ? 'working' : 'idle'} ${surface.usage?.output ?? 0}` }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row === 'deepseek/deepseek-v4 idle 0'))
  session.stands = { model: 'moonshot/kimi-k2', running: true, usage: { input: 1200, output: 340, cacheRead: 0 } }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).some(row => row === 'moonshot/kimi-k2 working 340'))
})

/** A plugin that places the notice the session stands at above the composer, or nothing. */
const placesTheNotice = (ctx: Context) =>
  ctx.plugin({ name: 'author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('above-composer', { kind: 'lines', draw: (_facts, surface) => ({ kind: 'text', text: surface.notice ?? '' }) }) } })

test('ctrl+c mid-turn interrupts the turn and says a second quits, and a second within three seconds quits', async () => {
  const terminal = new XtermTerminal(50, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  await placesTheNotice(ctx)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  session.running = true
  terminal.type('\x03')
  assert.equal(session.interrupted, 1)
  await until(async () => (await terminal.altScreen()).some(row => row === 'ctrl+c again to quit'))
  assert.deepEqual(exits, [])
  clock.advance(2_999)
  terminal.type('\x03')
  await until(() => exits.length > 0)
  assert.deepEqual(exits, [0])
})

test('ctrl+c while nothing runs only says a second quits; after three seconds the notice goes, and one ctrl+c no longer quits', async () => {
  const terminal = new XtermTerminal(50, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  await placesTheNotice(ctx)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x03')
  await until(async () => (await terminal.altScreen()).some(row => row === 'ctrl+c again to quit'))
  assert.equal(session.interrupted, 0)
  clock.advance(3_000)
  await until(async () => (await terminal.altScreen()).every(row => row !== 'ctrl+c again to quit'))
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [])
})

test('a composer placement whose submit throws is named in a notice, and the surface stays up', async () => {
  const terminal = new XtermTerminal(60, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesTheNotice(ctx)
  await ctx.plugin({ name: 'composer author', inject: ['binnacle'], apply: (author: Context) => { author.binnacle.place('composer', { kind: 'composer', submit: () => { throw new Error('no network') } }) } })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('hello')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some(row => row === 'binnacle.place(composer) submit threw: no network'))
})

test('a running call counts up once a second, and stops counting once it returns', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { commit } = await mount([], session, async () => session, terminal, async () => {}, clock)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  clock.advance(3)
  session.log(called(3, 'read'))
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'running 0s'))
  clock.advance(4_000)
  await until(async () => (await terminal.altScreen()).some(row => row.trim() === 'running 4s'))
  session.log(returned(4, 3, 'the file'))
  await until(async () => (await terminal.altScreen()).some(row => row.includes('the file')))
  assert.equal((await terminal.altScreen()).some(row => row.includes('running')), false)
})

test('a /name line naming one of the session\'s commands runs it and is not sent, and one naming none is sent as prose', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  session.commands.set('compact', 'summarize the session so far')
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('/compact now')
  terminal.type('\r')
  await until(() => session.ran.length > 0)
  assert.deepEqual(session.ran, ['/compact now'])
  terminal.type('/nothing here')
  terminal.type('\r')
  await until(() => session.sent.length > 0)
  assert.deepEqual(session.sent, ['/nothing here'])
})

test('typing / offers the session\'s commands and the skills a person may invoke, as dsh lists them', async () => {
  const terminal = new XtermTerminal(60, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  session.commands.set('compact', 'summarize the session so far')
  session.skills.set('review', 'review a change')
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('/')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some(row => row.includes('compact') && row.includes('summarize the session so far')) && rows.some(row => row.includes('review') && row.includes('review a change'))
  })
})

test('what / offers follows dsh: a command registered after the session opened is offered once dsh says so', async () => {
  const terminal = new XtermTerminal(60, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  session.commands.set('plan', 'plan before acting')
  session.offersChanged()
  await settle()
  terminal.type('/')
  await until(async () => (await terminal.altScreen()).some(row => row.includes('plan before acting')))
})

test('a placed screen is handed where the session stands, and is drawn again as it changes', async () => {
  const terminal = new XtermTerminal(60, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.screen('review', { key: 'f2', description: 'open the review', draw: (_facts, surface) => ({ kind: 'text', text: `${surface.model} ${surface.running ? 'working' : 'idle'}` }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some(row => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some(row => row === 'deepseek/deepseek-v4 idle'))
  session.stands = { model: 'deepseek/deepseek-v4', running: true }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).some(row => row === 'deepseek/deepseek-v4 working'))
})
