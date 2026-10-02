import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Events } from '@deepseek-ai/cordis'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { internals as cmdline, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { getKeybindings, stripTerminalSequences, setCapabilities, getCapabilities, resetCapabilitiesCache } from '@earendil-works/pi-tui'
import { LlmAttemptId, MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
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
import * as transcript from '../../src/plugins/transcript/index.ts'
import * as composer from '../../src/plugins/composer/index.ts'
import * as statusLine from '../../src/plugins/status-line/index.ts'
import * as toolCards from '../../src/plugins/tool-cards/index.ts'
import * as trajectory from '../../src/plugins/trajectory/index.ts'
import * as theme from '../../src/plugins/theme/index.ts'
import * as builtHost from '../../dist/host/index.js'
import * as builtTranscript from '../../dist/plugins/transcript/index.js'
import * as builtComposer from '../../dist/plugins/composer/index.js'
import * as builtStatusLine from '../../dist/plugins/status-line/index.js'
import * as builtToolCards from '../../dist/plugins/tool-cards/index.js'
import * as builtTrajectory from '../../dist/plugins/trajectory/index.js'
import * as builtTheme from '../../dist/plugins/theme/index.js'
import type { OpenedSession } from '../../src/host/session.ts'
import { called, seed as seedEvent } from '../support/events.ts'
import { FakeClock } from '../support/clock.ts'
import { FakeSession } from '../support/session.ts'
import { FakeTerminal, FailingTerminal, XtermTerminal } from '../support/terminal.ts'
import type { Node, Placement } from '../../src/api.ts'
import type { Entry } from '../../src/models/transcript.ts'
import type { Fact } from '../../src/facts/adapt.ts'

/** A person's line, as dsh logs it. */
const prompt = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message',
  seq: SessionSeq(seq),
  time: seq,
  surfaceOp: 'append',
  data: { role: 'user', id: MessageId(`m${seq}`), source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

/** A kind binnacle has no adapter for, as dsh logs it, logged when it was. */
const seed = (seq: number): SessionEvent<'test/marker'> => seedEvent(seq, seq)

/** What was added to the context without the person typing it, as dsh logs it: a tool change, which is the context the transcript still draws. */
const added = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message',
  seq: SessionSeq(seq),
  time: seq,
  surfaceOp: 'append',
  data: {
    role: 'user',
    id: MessageId(`m${seq}`),
    source: { kind: 'system-prompt' },
    content: [
      { type: 'text', text },
      { type: 'tool-addition', toolName: 'bash' },
    ],
  },
})

/** Let the host's pending promises settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

/** A plugin that places a screen of its own, opened with f2, drawing what it is told. */
const placesAScreen = (ctx: Context, draw: (facts: readonly Fact[]) => Node, name = 'review') =>
  ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.screen(name, { key: 'f2', description: 'open the review', draw })
    },
  })

/** A screen that names its rows, so what it drew is plain on the terminal. */
const namedRows =
  (count: number): ((facts: readonly Fact[]) => Node) =>
  (_facts) => ({
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
  while (!(await holds())) {
    if (Date.now() > deadline) throw new Error(`did not hold within ${within} ms`)
    await settle()
  }
}

/** A Cordis row, as binnacle's patch loads one: its module, taking the config a person's patch sets on it. */
type Row = { readonly name: string; readonly inject: readonly (keyof Context)[]; apply(ctx: Context, config: unknown): void }

/** A Cordis row, as binnacle's patch loads one: its module, with the config a person's patch sets on it. */
type Mounted = { readonly row: Row; readonly config?: unknown }

/** The built-in features binnacle's patch loads as rows beside the host's, in the order it inserts them. */
const ROWS: readonly Mounted[] = [transcript, composer, statusLine, toolCards, trajectory, theme].map((row) => ({ row }))

/** Mount the host on a real Context with the launcher's facts and dsh's services named, and commit startup. */
async function mount(
  args: string[],
  session = new FakeSession(),
  open: () => Promise<OpenedSession> = async () => session,
  terminal = new FakeTerminal(),
  provide: (ctx: Context) => Promise<void> = async () => {},
  clock: { now(): number; after(ms: number, then: () => void): () => void } = new FakeClock(),
  rows: readonly Mounted[] = ROWS,
) {
  const exits: number[] = []
  const out: string[] = []
  // The launcher's readiness: every listener runs once, in one go, at the commit — as the real one does (`dsh:apps/cli/src/profile-boot.ts#createAppReady`).
  const listeners = new Set<() => void>()
  let committed = false
  cmdline.stdout = {
    write: (chunk: string) => {
      out.push(chunk)
      return true
    },
  }
  cmdline.stderr = {
    write: (chunk: string) => {
      out.push(chunk)
      return true
    },
  }
  host.internals.terminal = () => terminal
  host.internals.stdout = {
    write: (chunk: string) => {
      out.push(chunk)
      return true
    },
  }
  host.internals.stderr = {
    write: (chunk: string) => {
      out.push(chunk)
      return true
    },
  }
  host.internals.open = open
  host.internals.clock = clock
  // Exact colours are drawn as the test's terminal would, never as the machine's.
  host.internals.colourMode = () => 'truecolor'
  // No test writes the machine's own clipboard.
  host.internals.clipboard = () => undefined
  const ctx = new Context()
  await provide(ctx)
  provideCmdline(ctx, {
    args,
    exit: (code) => {
      exits.push(code)
    },
    ready: {
      onReady: (listener) => {
        if (committed) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
  })
  ctx.provide('agents', {} as never)
  // dsh's session projections, which the Status line reads for the agent on screen: a stub answering with what the fake session says dsh has measured.
  ctx.provide('sessionProjections', {
    snapshot: () => ({ values: session.projections }),
    onChanged: (listener: () => void) => session.onProjections(listener),
  } as never)
  // dsh's default model, which opening a session reads; the host's tests fake the session, so nothing here varies it.
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  // dsh's preset registry, whose default a session opens on and whose roster the check reports; the host's tests fake the session, so a stand-in binds nothing and holds the five binnacle ships.
  ctx.provide('agentPresets', {
    mount: async () => ({ id: 'standard' }),
    list: async () => ['standard', 'ptc', 'minimal', 'cordis', 'author'].map((id) => ({ id })),
  } as never)
  // dsh's commands, which the row names; the host's tests fake the session, whose commands a test names, so nothing reads this.
  ctx.provide('commands', {} as never)
  const fiber = ctx.plugin(host)
  await fiber
  for (const { row, config } of rows) void ctx.plugin(row, config)
  return {
    ctx,
    fiber,
    exits,
    out,
    terminal,
    session,
    commit: () => {
      committed = true
      const run = [...listeners]
      listeners.clear()
      for (const listener of run) listener()
    },
  }
}

/** A profile directory with the theme files a test names written in it, as a person's profile holds them. */
function themed(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'binnacle-theme-'))
  mkdirSync(join(dir, 'themes'), { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'themes', `${name}.json`), text)
  return dir
}

/** The built-in rows with the theme row configured, through a profile whose directory a test made. */
const themedRows = (config: unknown): readonly Mounted[] =>
  ROWS.map((mounted) => (mounted.row === theme ? { row: theme, config } : mounted))

/** Wait until something holds, passing the theme grant's window each time it polls. */
async function drawing(clock: FakeClock, holds: () => boolean | Promise<boolean>): Promise<void> {
  await until(() => {
    clock.advance(50)
    return holds()
  }, 10_000)
}

/** The rows of the screen a person sees now, as literal lines. */
const screenRows = (terminal: XtermTerminal): Promise<readonly string[]> => terminal.altScreen()

/** What the host has said, unwrapped, as one text: a notice wraps where a terminal is narrow. */
const said = (terminal: { readonly written: string }): string => stripTerminalSequences(terminal.written).replaceAll(/[\r\n]+/g, '')

/**
 * The host mounted on a terminal emulated at a width, over a profile whose theme files a test wrote, started.
 * @param files - the theme files, by name.
 * @param config - the theme row's config, as a person's patch sets it.
 * @param columns - the terminal's width.
 * @param session - the session on screen.
 * @param rows - the rows to load, the theme row configured among them by default.
 * @returns the mount's, the profile directory, the clock and the terminal.
 */
async function themedSurface(
  files: Readonly<Record<string, string>>,
  config: unknown,
  columns = 80,
  session: FakeSession = new FakeSession([prompt(1, 'fix the build')]),
  rows: readonly Mounted[] = themedRows(config),
) {
  const dir = themed(files)
  const clock = new FakeClock()
  const terminal = new XtermTerminal(columns, 24)
  const mounted = await mount(
    [],
    session,
    async () => session,
    terminal,
    async (ctx) => {
      ctx.provide('profileContext', { dir } as never)
    },
    clock,
    rows,
  )
  mounted.commit()
  await until(() => terminal.started)
  return { ...mounted, dir, clock, terminal }
}

test('a theme row whose config is not the shape of { theme, light, dark } refuses to load, naming what to change, and contributes nothing', async () => {
  const { ctx, terminal, clock } = await themedSurface(
    { x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' },
    undefined,
    80,
    new FakeSession([prompt(1, 'fix the build')]),
    ROWS.filter((mounted) => mounted.row !== theme),
  )
  const load = async (config: unknown): Promise<unknown> => {
    await ctx.plugin(theme, config)
    return undefined
  }
  await assert.rejects(load({ theme: 5 }), /binnacle-theme: config.theme is 5, not the name of a theme file/)
  await assert.rejects(load({ colour: 'x' }), /binnacle-theme: config.colour is no part of the theme row’s config: theme, light, dark/)
  await assert.rejects(load('x'), /binnacle-theme: config is "x", not \{ theme, light, dark \}/)
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
  assert.ok((await screenRows(terminal)).includes(' › fix the build'), 'the file’s glyph never draws: nothing was contributed')
  assert.ok(terminal.written.includes('\u001b[36m›'), 'binnacle’s own accent draws')
})

test('a theme row with no config, or none of its fields, registers nothing', async () => {
  for (const config of [undefined, {}]) {
    const { terminal, clock } = await themedSurface({ x: '{"marks":{"prompt":{"glyph":">"}}}' }, config)
    await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
    assert.ok(terminal.written.includes('\u001b[36m›'), 'binnacle’s own accent draws')
  }
})

test("a theme row configured with a theme file draws in that file's colours and glyphs once the host reads it", async () => {
  const file = '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}'
  const wide = await themedSurface({ x: file }, { theme: 'x' }, 80)
  await drawing(wide.clock, async () => (await screenRows(wide.terminal)).includes(' > fix the build'))
  assert.ok(wide.terminal.written.includes('\u001b[31m>'), 'the mark draws in the file’s accent')
  const narrow = await themedSurface({ x: file }, { theme: 'x' }, 12)
  await drawing(narrow.clock, async () => (await screenRows(narrow.terminal)).includes(' > fix the'))
  assert.ok((await screenRows(narrow.terminal)).includes(' build'), 'the wrapped line says it all')
})

test('writing the theme file again redraws in the new colours, with no restart', async () => {
  const { dir, terminal, clock } = await themedSurface(
    { x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' },
    { theme: 'x' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  writeFileSync(join(dir, 'themes', 'x.json'), '{"marks":{"prompt":{"glyph":"»"}},"tones":{"accent":{"color":"green"}}}')
  await drawing(clock, async () => (await screenRows(terminal)).includes(' » fix the build'))
  assert.ok(terminal.written.includes('\u001b[32m»'), 'the new glyph draws in the new accent')
})

test("the theme row's light and dark files draw on a dark and a light terminal, without a restart", async () => {
  const { terminal, clock } = await themedSurface(
    { l: '{"tones":{"accent":{"color":"green"}}}', d: '{"tones":{"accent":{"color":"blue"}}}' },
    { light: 'l', dark: 'd' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
  terminal.type('\u001b[?997;1n')
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build') && terminal.written.includes('\u001b[34m›'))
  terminal.type('\u001b[?997;2n')
  await drawing(clock, () => terminal.written.includes('\u001b[32m›'))
  assert.ok((await screenRows(terminal)).includes(' › fix the build'), 'the line stands as it was, in the other variant’s colour')
})

test('the light and dark files replace the theme file’s own variants', async () => {
  const { terminal, clock } = await themedSurface(
    {
      x: '{"tones":{"accent":{"color":"red"}},"light":{"tones":{"accent":{"color":"yellow"}}}}',
      l: '{"tones":{"accent":{"color":"green"}}}',
    },
    { theme: 'x', light: 'l' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
  assert.ok(terminal.written.includes('\u001b[31m›'), 'the theme file’s own changes draw while the appearance is unknown')
  terminal.type('\u001b[?997;2n')
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build') && terminal.written.includes('\u001b[32m›'))
  assert.equal(terminal.written.includes('\u001b[33m›'), false, 'the theme file’s own light variant does not draw')
})

test('a pi theme file works as it is: its colors draw, "" leaves a token as binnacle has it, and the file’s own tones win', async () => {
  const { terminal, clock } = await themedSurface(
    {
      pi: JSON.stringify({
        $schema: './theme.schema.json',
        name: 'pi',
        appearance: 'dark',
        export: { pageBg: '#000000' },
        vars: { 'my ink': '#3c4148' },
        colors: { accent: 'my ink', text: '', userMessageBg: 17, muted: '#3c4148' },
        tones: { muted: { color: 'green' } },
      }),
    },
    { theme: 'pi' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
  assert.ok((await screenRows(terminal)).includes('deepseek/deepseek-v4'), 'the status line stands beneath')
  assert.ok(terminal.written.includes('\u001b[38;2;60;65;72m›'), 'a colors token may name a var, and draws as the tone')
  assert.ok(terminal.written.includes('\u001b[48;5;17m'), 'a …Bg token fills a background')
  assert.ok(terminal.written.includes('\u001b[32mdeepseek/deepseek-v4'), 'the file’s own tones win over its colors')
})

test('a theme file that is not there when the host reads it raises a notice naming its path, shown once the surface stands', async () => {
  const { terminal, clock } = await themedSurface({}, { theme: 'x' })
  await drawing(clock, () => said(terminal).includes('themes/x.json cannot be read'))
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
})

test('a malformed theme file raises a notice naming its path, and the last theme stays', async () => {
  const { dir, terminal, clock } = await themedSurface(
    { x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' },
    { theme: 'x' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  writeFileSync(join(dir, 'themes', 'x.json'), '{oops')
  await drawing(clock, () => said(terminal).includes('themes/x.json is not JSON'))
  assert.ok((await screenRows(terminal)).includes(' > fix the build'), 'the theme beneath the refused file stays')
  assert.equal(terminal.written.includes('\u001b[36m›'), false, 'the accent is not binnacle’s own again')
})

test('removing the theme file raises a notice naming its path, and the last theme stays', async () => {
  const { dir, terminal, clock } = await themedSurface(
    { x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' },
    { theme: 'x' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  rmSync(join(dir, 'themes', 'x.json'))
  await drawing(clock, () => said(terminal).includes('themes/x.json cannot be read'))
  assert.ok((await screenRows(terminal)).includes(' > fix the build'), 'the theme beneath the removed file stays')
  assert.equal(terminal.written.includes('\u001b[36m›'), false, 'the accent is not binnacle’s own again')
})

test('a change the theme refuses is raised as a notice naming its path, and the last registration stands', async () => {
  const { dir, terminal, clock } = await themedSurface(
    { x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' },
    { theme: 'x' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  writeFileSync(join(dir, 'themes', 'x.json'), '{"tones":{"accent":{"color":"no such colour"}}}')
  await drawing(clock, () => said(terminal).includes('themes/x.json was handed to a reader that threw'))
  assert.ok((await screenRows(terminal)).includes(' > fix the build'), 'the last registration stands')
})

test('a refused file’s changes stay refused while the others go on registering: the row keeps each file’s last accepted changes', async () => {
  const { dir, terminal, clock } = await themedSurface(
    {
      x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}',
      l: '{"tones":{"accent":{"color":"yellow"}}}',
    },
    { theme: 'x', light: 'l' },
  )
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  writeFileSync(join(dir, 'themes', 'l.json'), '{"tones":{"accent":{"color":"no such colour"}}}')
  await drawing(clock, () => said(terminal).includes('themes/l.json was handed to a reader that threw'))
  writeFileSync(join(dir, 'themes', 'x.json'), '{"marks":{"prompt":{"glyph":"»"}},"tones":{"accent":{"color":"blue"}}}')
  await drawing(clock, async () => (await screenRows(terminal)).includes(' » fix the build'))
  assert.ok(terminal.written.includes('\u001b[34m»'), 'the other file’s change registers')
  assert.equal(
    said(terminal).includes('themes/x.json was handed'),
    false,
    'the notice names the file whose change was refused, not the one that registered',
  )
  terminal.type('\u001b[?997;2n')
  await drawing(clock, async () => (await screenRows(terminal)).includes(' » fix the build') && terminal.written.includes('\u001b[33m»'))
})

test('disposing the theme row gives the theme back and closes the watch', async () => {
  const dir = themed({ x: '{"marks":{"prompt":{"glyph":">"}},"tones":{"accent":{"color":"red"}}}' })
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const terminal = new XtermTerminal(80, 24)
  const { ctx, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async (context) => {
      context.provide('profileContext', { dir } as never)
    },
    clock,
    ROWS.filter((mounted) => mounted.row !== theme),
  )
  const fiber = ctx.plugin(theme, { theme: 'x' })
  await fiber
  commit()
  await drawing(clock, async () => (await screenRows(terminal)).includes(' > fix the build'))
  await fiber.dispose()
  await drawing(clock, async () => (await screenRows(terminal)).includes(' › fix the build'))
  assert.ok(terminal.written.includes('\u001b[36m›'), 'the theme is binnacle’s own again')
  writeFileSync(join(dir, 'themes', 'x.json'), '{"tones":{"accent":{"color":"green"}}}')
  await new Promise((resolve) => setTimeout(resolve, 200))
  clock.advance(1_000)
  clock.advance(50)
  assert.equal(terminal.written.includes('\u001b[32m›'), false, 'the watch is closed: a write after it draws nothing')
})

/** The worked example the author skill ships, as its text: read from the skill’s directory, so the test holds the shipped file. */
const dusk = readFileSync(new URL('../../skills/binnacle-author/themes/dusk.json', import.meta.url), 'utf8')

/** One turn holding a prompt and a markdown answer, as a session logs them. */
const answeredTurn = (): FakeSession =>
  new FakeSession([
    prompt(1, 'fix the build'),
    answered(2, '## Ship it\n\nRun `pnpm test`, then see [the docs](https://example.com/docs).\n\n- check the theme\n'),
  ])

/** A markdown answer naming every markdown tone, as one answer. */
const markdownOfEveryTone =
  '## Ship it\n\nRun `pnpm test`, then read [the docs](https://example.com/docs).\n\n- check the theme\n\n> one way or another\n\n---\n\n```\nfenced\n```\n'

/** What a call returned, failing, as dsh logs it: an error result with its reason. */
const failedResult = (seq: number, callSeq: number, reason: string): SessionEvent<'tool/result'> => ({
  type: 'tool/result',
  seq: SessionSeq(seq),
  time: seq,
  surfaceOp: 'append',
  data: {
    turn: 1,
    step: 1,
    error: { name: 'ExitCodeError', code: '2', reason },
    message: {
      role: 'tool',
      id: MessageId(`m${seq}`),
      source: { kind: 'tool', callId: ToolCallId(`c${callSeq}`) },
      toolCallId: ToolCallId(`c${callSeq}`),
      isError: true,
      content: [{ type: 'text', text: reason }],
    },
  },
})

/** An answer whose turn was interrupted, as dsh marks it. */
const interrupted = (seq: number, text: string): SessionEvent<'assistant/message'> => ({
  ...answered(seq, text),
  data: { ...answered(seq, text).data, interrupted: true },
})

/** A session whose screen draws every part dusk names: a prompt, a markdown answer, a call that returned, one that failed, and an interrupted answer. */
const duskSession = (): FakeSession =>
  new FakeSession([
    prompt(1, 'fix the build'),
    answered(2, markdownOfEveryTone),
    called(3, 'read'),
    returned(4, 3, 'w\nx\ny\nz'),
    called(5, 'bash'),
    failedResult(6, 5, 'the command exited 2'),
    interrupted(7, 'part way through'),
  ])

test('dusk, the author skill’s worked example, draws the transcript, markdown and the composer in its colours, and its marks', async () => {
  const { terminal, clock } = await themedSurface({ dusk }, { theme: 'dusk' }, 64, answeredTurn())
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('Ship it')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m›'), 'the prompt mark draws in orchid, dusk’s accent')
  assert.ok(terminal.written.includes('\u001b[48;2;46;35;68m'), 'the prompt band fills with plum')
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m\u001b[1m fix the build'), 'the person’s words draw bold in orchid')
  assert.ok(terminal.written.includes('\u001b[38;2;247;168;216m\u001b[1m'), 'a heading draws bold in rose')
  assert.ok(terminal.written.includes('\u001b[38;2;184;161;255m\u001b[4m'), 'a link draws in violet, underlined')
  assert.ok(terminal.written.includes('\u001b[48;2;43;33;64m\u001b[38;2;226;194;255m'), 'inline code draws lilac on a chip')
  assert.ok(terminal.written.includes('\u001b[38;2;138;106;217m'), 'a list’s bullets draw in amethyst')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m\u2500'), 'the composer’s frame draws in dusk, the dim of the look')
})

test('an ask dusk frames in its accent, and a show’s title, gutter and mark in its tones', async () => {
  const session = new FakeSession([prompt(1, 'fix the build'), called(3, 'read')])
  const { ctx, terminal, clock } = await themedSurface({ dusk }, { theme: 'dusk' }, 64, session)
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('read')))
  void askQuestionsFor(ctx, session.agent, {
    questions: [{ id: 'q1', question: 'ship it?', options: [{ label: 'yes' }, { label: 'no' }] }],
  })
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('ship it?')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m\u256d'), 'the ask’s frame draws in orchid, the accent of a border')
  assert.ok(terminal.written.includes('\u001b[38;2;143;166;255m read'), 'the show’s title draws in iris')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m\u2502'), 'the show’s gutter draws in dusk, as chrome')
  assert.ok(terminal.written.includes('\u001b[38;2;166;152;200m\u25cf'), 'a running call’s mark draws in haze, the muted of the look')
})

test('a terminal turning light draws dusk’s light twin, pinned indices and all', async () => {
  const { terminal, clock } = await themedSurface({ dusk }, { theme: 'dusk' }, 64, answeredTurn())
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('Ship it')))
  terminal.written = ''
  terminal.type('\u001b[?997;2n')
  await drawing(clock, () => terminal.written.includes('\u001b[38;5;243m\u2500'))
  assert.ok(terminal.written.includes('\u001b[38;5;30m›'), 'the prompt mark draws in the pinned cyan')
  assert.ok(terminal.written.includes('\u001b[48;5;254m'), 'the prompt band fills with the pinned index 254')
  assert.ok(terminal.written.includes('\u001b[1m fix the build\u001b[22m'), 'the person’s words draw bold, in the terminal’s own colour')
  assert.ok(terminal.written.includes('\u001b[1mShip it\u001b[22m'), 'a heading draws bold, with no colour of its own')
  assert.ok(terminal.written.includes('\u001b[38;5;30m\u001b[4m'), 'a link draws in the pinned cyan, underlined')
  assert.ok(terminal.written.includes('\u001b[38;5;130m'), 'inline code draws in the pinned yellow, on nothing of its own')
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u2500'), 'the composer’s frame draws in the pinned grey')
  assert.equal(terminal.written.includes('\u001b[38;2;255;122;198m'), false, 'the dark look’s orchid is gone')
})

test('disposing the dusk row gives binnacle’s own theme back', async () => {
  const dir = themed({ dusk })
  const session = answeredTurn()
  const clock = new FakeClock()
  const terminal = new XtermTerminal(64, 24)
  const { ctx, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async (context) => {
      context.provide('profileContext', { dir } as never)
    },
    clock,
    ROWS.filter((mounted) => mounted.row !== theme),
  )
  const fiber = ctx.plugin(theme, { theme: 'dusk' })
  await fiber
  commit()
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('Ship it')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m›'), 'dusk draws while the row stands')
  await fiber.dispose()
  terminal.written = ''
  await drawing(clock, () => terminal.written.includes('\u001b[36m›'))
  assert.ok(terminal.written.includes('\u001b[36m›'), 'the prompt mark draws in binnacle’s own cyan')
  assert.ok(terminal.written.includes('\u001b[100m'), 'the prompt band fills with the terminal’s own bright black')
  assert.equal(terminal.written.includes('\u001b[38;2;'), false, 'no exact colour of dusk’s remains')
})

/** The built bundle’s host and rows, mounted as a profile loads them: from `dist`, over a profile holding dusk and the theme row choosing it.
 * @param session - the session on screen.
 * @param columns - the terminal’s width.
 * @param rows - the terminal’s height; tall enough that a session drawing every part fits without scrolling.
 * @returns the context, the commit that starts it, the session, the clock, the terminal, the profile directory, and the built theme row’s fiber.
 */
async function mountedBuilt(session: FakeSession, columns = 80, rows = 50) {
  const dir = themed({ dusk })
  const clock = new FakeClock()
  const terminal = new XtermTerminal(columns, rows)
  const listeners = new Set<() => void>()
  let committed = false
  cmdline.stdout = { write: () => true }
  cmdline.stderr = { write: () => true }
  builtHost.internals.terminal = () => terminal
  builtHost.internals.stdout = { write: () => true }
  builtHost.internals.stderr = { write: () => true }
  builtHost.internals.open = async () => session
  builtHost.internals.clock = clock
  builtHost.internals.colourMode = () => 'truecolor'
  builtHost.internals.clipboard = () => undefined
  const ctx = new Context()
  ctx.provide('profileContext', { dir } as never)
  ctx.provide('agents', {} as never)
  ctx.provide('sessionProjections', {
    snapshot: () => ({ values: session.projections }),
    onChanged: (listener: () => void) => session.onProjections(listener),
  } as never)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }) } as never)
  ctx.provide('agentPresets', {
    mount: async () => ({ id: 'standard' }),
    list: async () => ['standard', 'ptc', 'minimal', 'cordis', 'author'].map((id) => ({ id })),
  } as never)
  ctx.provide('commands', {} as never)
  provideCmdline(ctx, {
    args: [],
    exit: () => {},
    ready: {
      onReady: (listener) => {
        if (committed) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
  })
  await ctx.plugin(builtHost)
  for (const row of [builtTranscript, builtComposer, builtStatusLine, builtToolCards, builtTrajectory]) void ctx.plugin(row)
  const themeRow = ctx.plugin(builtTheme, { theme: 'dusk' })
  return {
    ctx,
    session,
    clock,
    terminal,
    dir,
    themeRow,
    commit: () => {
      committed = true
      const run = [...listeners]
      listeners.clear()
      for (const listener of run) listener()
    },
  }
}

test('the built bundle, with dusk chosen, draws every part it maps in the look’s colours, on a dark terminal', async (t) => {
  // pi-tui’s markdown prints a link’s address beside it only where the terminal has no hyperlinks; draw that path here.
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, hyperlinks: false })
  t.after(() => {
    setCapabilities(capabilities)
    resetCapabilitiesCache()
  })
  const session = duskSession()
  const { ctx, commit, clock, terminal } = await mountedBuilt(session)
  commit()
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('the command exited 2')))
  const rows = await screenRows(terminal)
  assert.ok(
    rows.some((row) => row.includes('fix the build')),
    'the prompt line is on screen',
  )
  assert.ok(
    rows.some((row) => row.includes('Ship it')),
    'the answer’s heading is',
  )
  assert.ok(
    rows.some((row) => row.includes('read {}')),
    'the show’s title is',
  )
  assert.ok(
    rows.some((row) => row.includes('deepseek/deepseek-v4')),
    'the status line is',
  )
  // The transcript and its marks: accent on the prompt, plum under the person’s words, bold orchid on them, mint on a call that returned, coral on one that failed, haze on the muted status line, dusk on the interrupted.
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m›'), 'accent: the prompt mark')
  assert.ok(terminal.written.includes('\u001b[48;2;46;35;68m'), 'userMessageBg: the prompt band')
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m\u001b[1m fix the build'), 'userMessageText: the person’s words')
  assert.ok(terminal.written.includes('\u001b[38;2;127;224;181m\u25cf'), 'success: the call that returned')
  assert.ok(terminal.written.includes('\u001b[38;2;255;107;129m\u2717'), 'error: the call that failed')
  assert.ok(terminal.written.includes('\u001b[38;2;255;107;129mthe command exited 2'), 'error: why it failed')
  assert.ok(terminal.written.includes('\u001b[38;2;166;152;200mdeepseek/deepseek-v4'), 'muted: the status line')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m(interrupted)'), 'dim: the interrupted answer')
  // Markdown, tone by tone: rose headings, violet links, dusk link addresses, lilac code on a chip, dusk a code block’s border, italic haze quotes beside amethyst, amethyst rules and bullets.
  assert.ok(terminal.written.includes('\u001b[38;2;247;168;216m\u001b[1m'), 'mdHeading')
  assert.ok(terminal.written.includes('\u001b[38;2;184;161;255m\u001b[4m'), 'mdLink')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m (https://example.com/docs)'), 'mdLinkUrl')
  assert.ok(terminal.written.includes('\u001b[48;2;43;33;64m\u001b[38;2;226;194;255mpnpm test'), 'mdCode')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m```'), 'mdCodeBlockBorder')
  assert.ok(terminal.written.includes('\u001b[38;2;166;152;200m\u001b[3m\u001b[3mone way'), 'mdQuote')
  assert.ok(terminal.written.includes('\u001b[38;2;138;106;217m\u2502 '), 'mdQuoteBorder: amethyst beside the quote')
  assert.ok(terminal.written.includes(`\u001b[38;2;138;106;217m${'\u2500'.repeat(80)}\u001b[39m`), 'mdHr: a full-width rule in amethyst')
  assert.ok(terminal.written.includes('\u001b[38;2;138;106;217m- \u001b[39m'), 'mdListBullet: the bullet in amethyst')
  // The shows and the chrome: iris titles beside a dusk gutter, a dusk composer frame.
  assert.ok(terminal.written.includes('\u001b[38;2;143;166;255m read'), 'toolTitle')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m\u2502'), 'borderMuted: the gutter')
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m\u2500'), 'borderMuted: the composer’s frame')
  // The fullscreen’s chrome needs the session taller than the window, so the label that jumps back has a reason to draw.
  for (const event of Array.from({ length: 10 }, (_, index) => [
    called(8 + index * 2, `read${index + 1}`),
    returned(9 + index * 2, 8 + index * 2, 'w\nx\ny\nz'),
  ]).flat())
    session.log(event)
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('read4 {}')))
  // The fullscreen’s chrome: the jump label in accent, a search’s matches in accent.
  for (let step = 0; step < 20 && !(await screenRows(terminal)).some((row) => row.includes('Jump to latest')); step++) {
    terminal.type('\u001b[Z')
    await settle()
    clock.advance(50)
  }
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('Jump to latest')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m \u2193 Jump to latest'), 'accent: the jump label')
  terminal.type('\u001b[102;6u')
  terminal.type('read')
  await drawing(clock, () => terminal.written.includes('\u001b[38;2;255;122;198mread\u001b[39m'))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198mread\u001b[39m'), 'searchMatchText: a search’s match')
  // Back to the end, so what the session logs next draws on screen.
  terminal.type('\x1b[F')
  await drawing(clock, async () => (await screenRows(terminal)).every((row) => row.includes('Jump to latest') === false))
  // The asks: an approval framed in accent, its decided entry under a warning mark, and an author’s ask in the dialog framed as chrome.
  void askApprovalFor(ctx, session.agent, { toolName: 'bash', reason: 'run the tests' })
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('run the tests')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m\u256d'), 'borderAccent: the approval’s frame')
  session.log({
    type: 'approval/asked',
    seq: SessionSeq(30),
    time: 30,
    data: { id: ApprovalRequestId('a1'), toolName: 'bash', callId: ToolCallId('c30'), reason: 'run the tests' },
  })
  session.log({ type: 'approval/decided', seq: SessionSeq(31), time: 31, data: { id: ApprovalRequestId('a1'), outcome: 'allowed-once' } })
  await drawing(clock, () => terminal.written.includes('allowed once'))
  assert.ok(terminal.written.includes('\u001b[38;2;255;183;132m\u2691'), 'warning: the approval’s mark')
  assert.ok(terminal.written.includes('\u001b[38;2;127;224;181m  allowed once'), 'success: what was decided')
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('dialog', {
        kind: 'lines',
        draw: () => ({ kind: 'ask', title: 'pick', child: { kind: 'stack', children: [chosen('a'), chosen('b')] } }),
      })
    },
  })
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('pick')))
  assert.ok(terminal.written.includes('\u001b[38;2;107;97;144m\u256d'), 'border: the dialog ask’s frame')
})

test('the built bundle draws dusk’s light twin the same way, on a light terminal', async (t) => {
  const capabilities = getCapabilities()
  setCapabilities({ ...capabilities, hyperlinks: false })
  t.after(() => {
    setCapabilities(capabilities)
    resetCapabilitiesCache()
  })
  const session = duskSession()
  const { ctx, commit, clock, terminal } = await mountedBuilt(session)
  commit()
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('the command exited 2')))
  terminal.type('\u001b[?997;2n')
  await drawing(clock, () => terminal.written.includes('\u001b[48;5;254m'))
  assert.ok(
    (await screenRows(terminal)).some((row) => row.includes('fix the build')),
    'the prompt line is on screen',
  )
  // The transcript and its marks: pinned cyan accent, 254 under the person’s bold words, green on a call that returned, red on one that failed, 240 on the muted status line, grey on the interrupted.
  assert.ok(terminal.written.includes('\u001b[38;5;30m›'), 'accent: the prompt mark')
  assert.ok(terminal.written.includes('\u001b[48;5;254m'), 'userMessageBg: the prompt band')
  assert.ok(
    terminal.written.includes('\u001b[1m fix the build\u001b[22m'),
    'userMessageText: the person’s words, bold in the terminal’s own colour',
  )
  assert.ok(terminal.written.includes('\u001b[38;5;28m\u25cf'), 'success: the call that returned')
  assert.ok(terminal.written.includes('\u001b[38;5;124m\u2717'), 'error: the call that failed')
  assert.ok(terminal.written.includes('\u001b[38;5;124mthe command exited 2'), 'error: why it failed')
  assert.ok(terminal.written.includes('\u001b[38;5;240mdeepseek/deepseek-v4'), 'muted: the status line')
  assert.ok(terminal.written.includes('\u001b[38;5;243m(interrupted)'), 'dim: the interrupted answer')
  // Markdown: bold headings, cyan links and bullets, grey everything else a markdown answer draws.
  assert.ok(terminal.written.includes('\u001b[1mShip it\u001b[22m'), 'mdHeading')
  assert.ok(terminal.written.includes('\u001b[38;5;30m\u001b[4m'), 'mdLink')
  assert.ok(terminal.written.includes('\u001b[38;5;243m (https://example.com/docs)'), 'mdLinkUrl')
  assert.ok(terminal.written.includes('\u001b[38;5;130mpnpm test'), 'mdCode')
  assert.ok(terminal.written.includes('\u001b[38;5;243m```'), 'mdCodeBlockBorder')
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u001b[3mone way'), 'mdQuote')
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u2502 '), 'mdQuoteBorder')
  const greyRule = `\u001b[38;5;243m${'\u2500'.repeat(80)}`
  const rule = terminal.written.indexOf(greyRule)
  const fence = terminal.written.indexOf('\u001b[38;5;243m```', rule + greyRule.length)
  assert.ok(rule !== -1 && fence !== -1 && fence - (rule + greyRule.length) < 40, 'mdHr: the grey rule, with the fence on the row after it')
  assert.ok(terminal.written.includes('\u001b[38;5;30m- \u001b[39m'), 'mdListBullet: the bullet in cyan')
  // The shows and the chrome: blue titles beside a grey gutter and composer frame.
  assert.ok(terminal.written.includes('\u001b[38;5;26m read'), 'toolTitle')
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u2502'), 'borderMuted: the gutter')
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u2500'), 'borderMuted: the composer’s frame')
  // The fullscreen’s chrome, the asks, the search: cyan where the dark look is orchid, grey where it is dusk.
  for (const event of Array.from({ length: 10 }, (_, index) => [
    called(8 + index * 2, `read${index + 1}`),
    returned(9 + index * 2, 8 + index * 2, 'w\nx\ny\nz'),
  ]).flat())
    session.log(event)
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('read4 {}')))
  for (let step = 0; step < 20 && !(await screenRows(terminal)).some((row) => row.includes('Jump to latest')); step++) {
    terminal.type('\u001b[Z')
    await settle()
    clock.advance(50)
  }
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('Jump to latest')))
  assert.ok(terminal.written.includes('\u001b[38;5;30m \u2193 Jump to latest'), 'accent: the jump label')
  terminal.type('\x1b[102;6u')
  terminal.type('read')
  await drawing(clock, () => terminal.written.includes('\u001b[38;5;30mread\u001b[39m'))
  assert.ok(terminal.written.includes('\u001b[38;5;30mread\u001b[39m'), 'searchMatchText: a search’s match')
  terminal.type('\x1b[F')
  await drawing(clock, async () => (await screenRows(terminal)).every((row) => row.includes('Jump to latest') === false))
  void askApprovalFor(ctx, session.agent, { toolName: 'bash', reason: 'run the tests' })
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('run the tests')))
  assert.ok(terminal.written.includes('\u001b[38;5;30m\u256d'), 'borderAccent: the approval’s frame')
  session.log({
    type: 'approval/asked',
    seq: SessionSeq(30),
    time: 30,
    data: { id: ApprovalRequestId('a1'), toolName: 'bash', callId: ToolCallId('c30'), reason: 'run the tests' },
  })
  session.log({ type: 'approval/decided', seq: SessionSeq(31), time: 31, data: { id: ApprovalRequestId('a1'), outcome: 'allowed-once' } })
  await drawing(clock, () => terminal.written.includes('allowed once'))
  assert.ok(terminal.written.includes('\u001b[38;5;130m\u2691'), 'warning: the approval’s mark')
  assert.ok(terminal.written.includes('\u001b[38;5;28m  allowed once'), 'success: what was decided')
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('dialog', {
        kind: 'lines',
        draw: () => ({ kind: 'ask', title: 'pick', child: { kind: 'stack', children: [chosen('a'), chosen('b')] } }),
      })
    },
  })
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('pick')))
  assert.ok(terminal.written.includes('\u001b[38;5;243m\u256d'), 'border: the dialog ask’s frame')
})

test('disposing the built theme row gives binnacle’s own theme back, and its watch draws nothing more', async () => {
  const { themeRow, commit, clock, terminal, dir } = await mountedBuilt(new FakeSession([prompt(1, 'fix the build')]))
  await themeRow
  commit()
  await drawing(clock, async () => (await screenRows(terminal)).some((row) => row.includes('fix the build')))
  assert.ok(terminal.written.includes('\u001b[38;2;255;122;198m›'), 'dusk draws while the built row stands')
  await themeRow.dispose()
  terminal.written = ''
  await drawing(clock, () => terminal.written.includes('\u001b[36m›'))
  assert.ok(terminal.written.includes('\u001b[36m›'), 'the prompt mark draws in binnacle’s own cyan')
  assert.equal(terminal.written.includes('\u001b[38;2;'), false, 'no exact colour of dusk’s remains')
  writeFileSync(join(dir, 'themes/dusk.json'), '{"tones":{"accent":{"color":"green"}}}')
  await new Promise((resolve) => setTimeout(resolve, 200))
  clock.advance(1_000)
  clock.advance(50)
  assert.equal(terminal.written.includes('\u001b[32m›'), false, 'the watch is closed: a write after disposal draws nothing')
})

test('the row is named binnacle and needs the command line, the agents, the default model, the preset registry and the commands', () => {
  assert.equal(host.name, 'binnacle')
  assert.deepEqual(host.inject, ['cmdlineArgs', 'agents', 'agentDefaultModel', 'agentPresets', 'commands'])
})

test('the host alone draws no built-in feature a patch row loads: no transcript, no status line, and no composer takes typing', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    new FakeClock(),
    [],
  )
  commit()
  await until(() => terminal.started)
  await settle()
  terminal.type('hello')
  terminal.type('\r')
  await settle()
  const rows = await terminal.altScreen()
  assert.equal(
    rows.some((row) => row.includes('fix the build')),
    false,
    'no transcript is drawn',
  )
  assert.equal(
    rows.some((row) => row.includes('deepseek/deepseek-v4')),
    false,
    'no status line is drawn',
  )
  assert.deepEqual(session.sent, [], 'no composer takes typing')
})

test('--check opens a session on the default model once startup commits, reports it with the roster of presets it mounted, closes it, and exits 0 drawing nothing', async () => {
  const { exits, out, terminal, session, commit } = await mount(['--check'])
  assert.deepEqual(exits, [])
  commit()
  await settle()
  assert.deepEqual(out, ['binnacle: ok (deepseek/deepseek-v4, presets: standard, ptc, minimal, cordis, author)\n'])
  assert.equal(session.closed, true)
  assert.deepEqual(exits, [0])
  assert.equal(terminal.started, false)
})

test('--help prints the usage and the keys, and exits 0 without holding the terminal', async () => {
  const { exits, out, terminal } = await mount(['--help'])
  assert.match(out.join(''), /Usage: dsh --profile binnacle/)
  assert.match(out.join(''), /Keys:/)
  for (const named of ['shift+tab', 'tab, down', 'up', 'enter', 'escape', 'ctrl+c', 'ctrl+t'])
    assert.ok(out.join('').includes(named), named)
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
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('composer', {
        kind: 'composer',
        submit: (text) => {
          seen.push(text)
        },
      })
    },
  })
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

test("the host installs the one key table, so the composer reads binnacle's bindings beside pi-tui's own", async () => {
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
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' }))
    },
  })
  commit()
  await until(() => /drawn by an author/.test(terminal.written))
})

test('a view registered after its entries were drawn draws them again, and disposing it gives them back', async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  commit()
  const shown = (): string => stripTerminalSequences(terminal.written)
  await until(() => /› fix the build/.test(shown()))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' }))
    },
  })
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
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ marks: { prompt: { glyph: '>' } } })
    },
  })
  await author
  await until(() => /> fix the build/.test(shown()))
  terminal.written = ''
  await author.dispose()
  await until(() => /› fix the build/.test(shown()))
})

test("the composer's frame is drawn in pi's borderMuted token, as a registration changes it and until it is disposed", async () => {
  const { ctx, terminal, commit } = await mount([])
  commit()
  await until(() => terminal.written.includes('\x1b[2m─'))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ tones: { borderMuted: { color: 'red' } } })
    },
  })
  await author
  await until(() => terminal.written.includes('\x1b[31m─'))
  terminal.written = ''
  await author.dispose()
  await until(() => terminal.written.includes('\x1b[2m─'))
})

test("binnacle's own colours are derived from the background the terminal answers with, and stay its sixteen while it answers nothing", async () => {
  const { terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  commit()
  await until(() => terminal.written.includes('\x1b[36m›'))
  // Catppuccin Mocha's background and foreground, with no palette: the accent the derivation's worked example gives, #a494d6.
  terminal.type('\x1b]10;rgb:cdcd/d6d6/f4f4\x1b\\')
  terminal.type('\x1b]11;rgb:1e1e/1e1e/2e2e\x1b\\')
  terminal.type('\x1b[?62c')
  await until(() => terminal.written.includes('\x1b[38;2;164;148;214m›'))
})

test("a terminal that says it is dark but reports no background keeps binnacle's sixteen", async () => {
  const { terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  commit()
  await until(() => terminal.written.includes('\x1b[36m›'))
  terminal.written = ''
  terminal.type('\x1b[?997;1n')
  // The colours asked again go unanswered, and are read as nothing once pi-tui stops waiting.
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(terminal.written.includes('\x1b[38;5;5m›'), false, "not drawn in pi's indexed fallback")
})

test("the terminal saying it turned dark or light draws the theme's variant for it, without a restart", async () => {
  const { ctx, terminal, commit } = await mount([], new FakeSession([prompt(1, 'fix the build')]))
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ dark: { tones: { accent: { color: 'blue' } } }, light: { tones: { accent: { color: 'green' } } } })
    },
  })
  commit()
  await until(() => terminal.written.includes('\x1b[36m›'))
  terminal.type('\x1b[?997;1n')
  await until(() => terminal.written.includes('\x1b[34m›'))
  terminal.type('\x1b[?997;2n')
  await until(() => terminal.written.includes('\x1b[32m›'))
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
      plugin.binnacle.view('session/end-seed', (entry) => {
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
  const { exits, out, terminal, commit } = await mount([], new FakeSession(), async () => {
    throw new Error('no key for deepseek')
  })
  commit()
  await settle()
  assert.deepEqual(out, ['binnacle: could not open a session on the default model: no key for deepseek\n'])
  assert.deepEqual(exits, [1])
  assert.equal(terminal.started, false)
})

test('a session that fails to close on ctrl+c still gives the terminal back, says why, and asks to exit 1', async () => {
  const session = new FakeSession()
  session.close = async () => {
    throw new Error('the agent did not stop')
  }
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
      plugin.binnacle.facts('test/marker', () => {
        adapted++
        return { name: 'seeded', data: {} }
      })
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

test("a session's call draws its presented title", async () => {
  const session = new FakeSession([])
  const { terminal, commit } = await mount(
    [],
    session,
    async () => session,
    new FakeTerminal(),
    async (ctx) => {
      await ctx.plugin(SystemPrompt, {})
      const tools = new ToolRuntime(ctx)
      tools.register(
        defineTool({
          name: 'read',
          description: 'Read a file.',
          parameters: { path: { type: 'string' } },
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
          execute: async () => 'the file',
          presentCall: (args) => ({ card: 'generic', title: `Read ${args.path}` }),
        }),
      )
    },
  )
  commit()
  await settle()
  session.log({
    type: 'tool/call',
    seq: SessionSeq(2),
    time: 2,
    data: { turn: 1, step: 1, callId: ToolCallId('c2'), name: 'read', arguments: '{"path":"src/api.ts"}' },
  })
  await until(() => /Read src\/api\.ts/.test(terminal.written))
  session.log(returned(3, 2, 'the file'))
  await until(() => /the file/.test(terminal.written))
  assert.equal(stripTerminalSequences(terminal.written).includes('● read'), false)
})

/** What a call returned, as dsh logs it. */
const returned = (seq: number, callSeq: number, text: string): SessionEvent<'tool/result'> => ({
  type: 'tool/result',
  seq: SessionSeq(seq),
  time: seq,
  surfaceOp: 'append',
  data: {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      id: MessageId(`m${seq}`),
      source: { kind: 'tool', callId: ToolCallId(`c${callSeq}`) },
      toolCallId: ToolCallId(`c${callSeq}`),
      content: [{ type: 'text', text }],
    },
  },
})

/** A command that ran, as dsh logs it: log-only, no turn around it. */
const ran = (seq: number, commandId: string, name: string): SessionEvent<'command/run'> => ({
  type: 'command/run',
  seq: SessionSeq(seq),
  time: seq,
  data: { commandId: CommandId(commandId), name, args: '', source: { kind: 'user' } },
})

/** The done that settled a command, as dsh logs it. */
const done = (seq: number, commandId: string, text: string): SessionEvent<'command/done'> => ({
  type: 'command/done',
  seq: SessionSeq(seq),
  time: seq,
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
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.view('prompt', () => ({ kind: 'text', text: 'drawn by an author' }))
    },
  })
  await author
  session.log(prompt(15, 'p15'))
  await until(() => /drawn by an author/.test(terminal.written))
  const shown = await terminal.mainScreen()
  assert.equal(shown[0], '$ dsh --profile binnacle')
  assert.deepEqual(
    shown.filter((row) => row.startsWith(' › ')),
    twelve.map((_, index) => ` › p${index + 1}`),
  )
  assert.deepEqual(
    shown.filter((row) => /read|the file|running|author/.test(row)),
    ['● read {}', '│ the file', 'drawn by an author'],
  )
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
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('fix the build')))
  session.log(ran(4, 'cmd-1a2b3c4d-1', 'compact'))
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('running…')))
  session.log(done(5, 'cmd-1a2b3c4d-1', 'compacted: 12 messages'))
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('compacted: 12 messages')))
  const shown = await terminal.mainScreen()
  assert.equal(
    shown.some((row) => row.includes('running…')),
    false,
  )
  assert.ok(
    shown.some((row) => row === '/compact'),
    'the line the person typed heads the entry',
  )
})

const attemptId = LlmAttemptId('a1')

/** The answer dsh logs for turn 1, step 1, saying what it says. */
const answered = (seq: number, text: string): SessionEvent<'assistant/message'> => ({
  type: 'assistant/message',
  seq: SessionSeq(seq),
  time: seq,
  surfaceOp: 'append',
  data: {
    turn: 1,
    step: 1,
    stream: [],
    message: {
      role: 'assistant',
      id: MessageId(`m${seq}`),
      source: { kind: 'model', provider: 'deepseek', model: 'deepseek-v4' },
      content: [{ type: 'text', text }],
    },
  },
})

test('on the main screen, an answer is drawn as it streams, and printed once when the session logs it', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([{ type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } }, prompt(2, 'say hello')])
  const { commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('say hello')))
  session.stream({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
  session.stream({ type: 'chunk', attemptId, revision: 1, index: 0, time: 3, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
  session.stream({ type: 'chunk', attemptId, revision: 1, index: 1, time: 3, chunk: { type: 'text-delta', index: 0, text: 'Hello' } })
  await until(async () => (await terminal.mainScreen()).some((row) => row === 'Hello'))
  session.stream({ type: 'chunk', attemptId, revision: 1, index: 2, time: 4, chunk: { type: 'text-delta', index: 0, text: ', world' } })
  await until(async () => (await terminal.mainScreen()).some((row) => row === 'Hello, world'))
  session.log(answered(3, 'Hello, world'))
  session.stream({
    type: 'end',
    attemptId,
    revision: 1,
    index: 3,
    outcome: { kind: 'committed', eventType: 'assistant/message', seq: SessionSeq(3) },
  })
  session.log({ type: 'turn/end', seq: SessionSeq(4), time: 5, data: { turn: 1, reason: { kind: 'completed' } } })
  session.log(prompt(5, 'next'))
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('next')))
  assert.deepEqual(
    (await terminal.mainScreen()).filter((row) => row.startsWith('Hello')),
    ['Hello, world'],
  )
})

test('quitting while an answer streams leaves only what the session logged on the main screen', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([{ type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } }, prompt(2, 'say hello')])
  const { exits, commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('say hello')))
  session.stream({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
  session.stream({ type: 'chunk', attemptId, revision: 1, index: 0, time: 3, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
  session.stream({ type: 'chunk', attemptId, revision: 1, index: 1, time: 3, chunk: { type: 'text-delta', index: 0, text: 'Hello' } })
  await until(async () => (await terminal.mainScreen()).some((row) => row === 'Hello'))
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length > 0)
  const shown = await terminal.mainScreen()
  assert.ok(shown.some((row) => row.includes('say hello')))
  assert.equal(
    shown.some((row) => row === 'Hello'),
    false,
  )
})

test('ctrl+t switches screens both ways, and what is typed, what every entry drew, and ctrl+c come along', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  let calls = 0
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.view('prompt', (_, next) => {
        calls++
        return next()
      })
    },
  })
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
  assert.ok((await terminal.mainScreen()).some((row) => row.includes('hello')))
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
  for (const [args, switches] of [
    [[], 0],
    [['--tui-mode', 'regular'], 1],
    [['--tui-mode', 'regular'], 2],
  ] as const) {
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
    assert.deepEqual(
      (await terminal.mainScreen()).filter((row) => row.startsWith(' › ')),
      [' › p1', ' › p2', ' › p3', ' › p4'],
      `${args.join(' ') || 'fullscreen'}, switched ${switches} times`,
    )
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
  // Tall enough for the card's head and all it returned, once open.
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([called(13, 'read'), returned(14, 13, 'w\nx\ny\nz')])
  const { session: sent, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '│ z'))
  terminal.type('x')
  await until(async () => !(await terminal.altScreen()).some((row) => row.includes('▸')))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
  for (let entry = 5; entry >= 1; entry--) {
    terminal.type('\x1b[Z')
    await until(async () => {
      const rows = await terminal.altScreen()
      return rows[0] === `● read${entry} {}` && rows[4]?.includes('▸ show') === true
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  assert.equal(
    (await terminal.altScreen()).some((row) => row.includes('Jump to latest')),
    false,
  )
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('↓ Jump to latest · end')))
  assert.ok(terminal.written.includes('\x1b[36m ↓ Jump to latest · end '), 'the label is drawn in the accent tone')
})

test("the jump label is drawn in the chrome an author's theme gives it", async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ chrome: { jump: 'v' } })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('v Jump to latest · end')))
})

test("the key the label names brings the transcript's last line back, following again, and the label goes", async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  assert.equal(
    (await terminal.altScreen()).some((row) => row.includes('Jump to latest')),
    false,
  )
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('↓ Jump to latest · end')))
  terminal.type('\x1b[F')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.every((row) => row.includes('Jump to latest') === false) && rows[4] === '│ … 1 more line'
  })
})

test('the label names whatever the one key table binds to jump to the end, so a rebinding is named', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  terminal.type('\x1b[Z')
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('↓ Jump to latest · end')))
  try {
    getKeybindings().setUserBindings({ 'tui.altScreen.bottom': 'ctrl+end' })
    session.log(prompt(7, 'and the tests'))
    await until(async () => (await terminal.altScreen()).some((row) => row.includes('↓ Jump to latest · ctrl+end')))
  } finally {
    getKeybindings().setUserBindings({})
  }
})

test('from the main screen, a fold in a printed entry opens on the fullscreen by key, in view and focused, and the main screen is as it was after switching back', async () => {
  // Tall enough for the card's head and all it returned, once open.
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('… 1 more line')))
  const before = await terminal.mainScreen()
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.onAlternateScreen()) === true)
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '│ z'))
  terminal.type('\x14')
  await settle()
  const after = await terminal.mainScreen()
  assert.deepEqual(after, before)
  assert.equal(
    after.some((row) => row.includes('▸')),
    false,
  )
})

test('focus the main screen could not draw comes back with the fullscreen, drawn', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ fold to 3 lines')))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).includes('● read {}'))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === true)
  await settle()
  assert.deepEqual((await terminal.altScreen()).slice(0, 5), ['│ w', '│ x', '│ y', '│ z', '│ ▸ fold to 3 lines'])
})

test('focus the fullscreen gives back is brought into view, however far up the session it sits', async () => {
  const terminal = new XtermTerminal(40, 9)
  const logged: SessionEvent[] = []
  for (let entry = 1; entry <= 6; entry++) logged.push(called(entry * 2, `read${entry}`), returned(entry * 2 + 1, entry * 2, 'w\nx\ny\nz'))
  const session = new FakeSession(logged)
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  for (let step = 0; step < 6; step++) terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen())[0] === '● read1 {}')
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).includes('● read6 {}'))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === true && (await terminal.altScreen())[0] === '● read1 {}')
  const rows = await terminal.altScreen()
  assert.deepEqual(rows.slice(0, 4), ['● read1 {}', '│ w', '│ x', '│ y'])
  assert.match(rows[4] ?? '', /▸ show.*Jump to latest/)
})

test('typing on the main screen forgets where focus was, so enter back on the fullscreen sends what was typed', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build'), called(2, 'read'), returned(3, 2, 'w\nx\ny\nz')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
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
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('⋯ added by ')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('system-prompt · show 3 more')))
  assert.equal(await terminal.onAlternateScreen(), false)
  terminal.type('\r')
  await until(async () => {
    const rows = await terminal.mainScreen()
    return rows.some((row) => row.trim() === 'a') && rows.some((row) => row.trim() === 'b')
  })
  const after = await terminal.mainScreen()
  assert.deepEqual(after.slice(0, 9), ['', ' › one', '', '', '● read {}', '│ w', '│ x', '│ y', '│ … 1 more line'])
  assert.deepEqual(after.slice(9, 18), [
    '',
    '● stat {}',
    '│ running 0s',
    '',
    '▸ ⋯ added by system-prompt · fold it',
    'away',
    'a',
    'b',
    '[tool-addition]',
  ])
})

test("the key a plugin offers opens its screen in the transcript's place, the composer below it, and the same key returns the transcript as it was", async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const before = await terminal.altScreen()
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  terminal.type('\x1bOQ')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('fix the build')) && rows.every((row) => row.startsWith('screen ') === false)
  })
  assert.deepEqual(await terminal.altScreen(), before)
})

test('escape returns to the transcript as it was, its scroll and what it drew unchanged', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession(folded)
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
  terminal.type('\x1b[5~')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('Jump to latest')))
  const scrolled = await terminal.altScreen()
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  terminal.type('\x1b')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('read6') === false) && rows.every((row) => row.startsWith('screen ') === false)
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
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('three')))
  const before = await terminal.mainScreen()
  terminal.type('\x1bOQ')
  await until(
    async () =>
      (await terminal.onAlternateScreen()) === true && (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')),
  )
  terminal.type('\x1bOQ')
  await until(
    async () => (await terminal.onAlternateScreen()) === false && (await terminal.mainScreen()).some((row) => row.includes('three')),
  )
  assert.deepEqual(await terminal.mainScreen(), before)
})

test('quitting answers on a placed screen, and the session is left printed plain, without it', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'one'), prompt(2, 'two'), prompt(3, 'three')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('three')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  terminal.type('\x03')
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [0])
  const left = await terminal.mainScreen()
  assert.deepEqual(
    left.filter((row) => row.startsWith(' › ')),
    [' › one', ' › two', ' › three'],
  )
  assert.equal(
    left.some((row) => row.includes('screen ')),
    false,
  )
})

test('disposing the plugin closes its screen if it is open, and takes back its key, which reaches the composer typed', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const fiber = await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  await fiber.dispose()
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('fix the build')) && rows.every((row) => row.startsWith('screen ') === false)
  })
  terminal.type('\x1bOQ')
  await settle()
  assert.equal(
    (await terminal.altScreen()).some((row) => row.includes('fix the build')),
    true,
    'the key no longer opens anything',
  )
})

test('a screen whose drawing throws draws what went wrong, naming its registration, and the surface stays up', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, () => {
    throw new Error('no phone')
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('✗ binnacle.screen(review) threw: no')))
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === 'phone'))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 11).every((row) => row.startsWith('screen ')))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  terminal.type('note')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['note'])
  assert.equal(
    (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')),
    true,
    'the screen stays open',
  )
})

test('leaving the alternate screen closes a placed screen open on it, and the transcript returns', async () => {
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, namedRows(12))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) === false)
  await until(async () => {
    const rows = await terminal.mainScreen()
    return rows.some((row) => row.includes('fix the build')) && rows.every((row) => row.startsWith('screen ') === false)
  })
  terminal.type('\x14')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('fix the build')) && rows.every((row) => row.startsWith('screen ') === false)
  }, 4000)
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).slice(0, 5).every((row) => row.startsWith('screen ')))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('before turn 1')))
  click(terminal, 3, 2)
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '"type": "test/marker",'))
  const opened = await terminal.altScreen()
  assert.ok(opened.some((row) => row.includes('0 ? test/marker')))
  assert.ok(opened.some((row) => row.trim() === '"data": {}'))
  terminal.type('note')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['note'])
})

test('enter opens the line a person focused, and focus reaches the screen from the composer by shift+tab', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('before turn 1')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ 3 turn 1 ended') && row.includes('· show')))
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '"kind": "turn",'))
})

test('the trajectory follows a live session: an event logged while it is open draws its line', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('3 turn 1 ended · completed')))
  session.log(seed(4))
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('4 ? test/marker')))
})

test('ctrl+o opens the trajectory, one line per event with the machinery in it, and escape returns the transcript as it was', async () => {
  const terminal = new XtermTerminal(60, 18)
  const session = new FakeSession(trajectorySession())
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x0f')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('before turn 1')) && rows.some((row) => row.includes('0 ? test/marker'))
  })
  const opened = await terminal.altScreen()
  assert.ok(opened.some((row) => row.includes('1 turn 1 begins')))
  assert.ok(opened.some((row) => row.includes('2 › fix the build')))
  assert.ok(opened.some((row) => row.includes('3 turn 1 ended · completed')))
  terminal.type('\x1b')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('fix the build')) && rows.every((row) => row.includes('turn 1 begins') === false)
  })
})

/** A plugin that places lines in a slot, drawing what it is told. */
const placesLines = (ctx: Context, slot: 'above-composer' | 'below-composer', text: string) =>
  ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place(slot, { kind: 'lines', draw: () => ({ kind: 'text', text }) })
    },
  })

test('a line placed below the composer is drawn under it on the alternate screen, and disposing its plugin takes it back', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const author = placesLines(ctx, 'below-composer', 'the status')
  await author
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  assert.deepEqual((await terminal.altScreen()).slice(-5), ['─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4', 'the status'])
  await author.dispose()
  await until(async () => (await terminal.altScreen()).every((row) => row !== 'the status'))
  assert.deepEqual((await terminal.altScreen()).slice(-4), ['─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4'])
})

test('on the main screen, a line placed below the composer is printed under it', async () => {
  const terminal = new XtermTerminal(40, 8)
  terminal.write('$ dsh --profile binnacle\r\n')
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  await placesLines(ctx, 'below-composer', 'the status')
  commit()
  await until(async () => (await terminal.mainScreen()).some((row) => row.includes('the status')))
  assert.deepEqual(await terminal.mainScreen(), [
    '$ dsh --profile binnacle',
    '',
    ' › fix the build',
    '',
    '─'.repeat(40),
    '',
    '─'.repeat(40),
    'deepseek/deepseek-v4',
    'the status',
  ])
})

test('a line placed above the composer is drawn between the transcript and the composer', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesLines(ctx, 'above-composer', 'a hint')
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('a hint')))
  assert.deepEqual((await terminal.altScreen()).slice(-5), ['a hint', '─'.repeat(40), '', '─'.repeat(40), 'deepseek/deepseek-v4'])
})

test('two lines placed in one slot are drawn oldest first', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesLines(ctx, 'below-composer', 'placed first')
  await placesLines(ctx, 'below-composer', 'placed second')
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('placed second')))
  assert.deepEqual((await terminal.altScreen()).slice(-2), ['placed first', 'placed second'])
})

test('a line placed below the composer is drawn again as facts arrive', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('below-composer', { kind: 'lines', draw: (facts) => ({ kind: 'text', text: `${facts.length} facts` }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === '1 facts')
  session.log(prompt(2, 'and the tests'))
  await until(async () => (await terminal.altScreen()).at(-1) === '2 facts')
})

test("with lines in the composer's place, what is typed is sent nowhere, and ctrl+c still quits", async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('composer', { kind: 'lines', draw: () => ({ kind: 'text', text: 'read only' }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).at(-2) === 'read only')
  assert.equal(
    (await terminal.altScreen()).some((row) => row === '─'.repeat(40)),
    false,
  )
  terminal.type('hello')
  terminal.type('\r')
  await settle()
  assert.deepEqual(session.sent, [])
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length > 0)
  assert.deepEqual(exits, [0])
})

test("lines placed in the composer's place after it is drawn take it, and disposing them gives the composer back, typing and all", async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-2) === '─'.repeat(40))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('composer', { kind: 'lines', draw: () => ({ kind: 'text', text: 'read only' }) })
    },
  })
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
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('below-composer', {
        kind: 'lines',
        draw: () => {
          throw new Error('no model')
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  await until(async () => (await terminal.altScreen()).at(-1) === '✗ binnacle.place(below-composer) threw: no model')
  terminal.type('hello')
  terminal.type('\r')
  assert.deepEqual(session.sent, ['hello'])
})

test('one placement in two slots is named by each slot when it goes wrong, not by the first alone', async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const placement = {
    kind: 'lines' as const,
    draw: (): Node => {
      throw new Error('no model')
    },
  }
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', placement)
      author.binnacle.place('below-composer', placement)
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const rows = await terminal.altScreen()
  assert.ok(
    rows.some((row) => row.trim() === '✗ binnacle.place(above-composer) threw: no model'),
    'the line above names its own registration',
  )
  assert.ok(
    rows.some((row) => row.trim() === '✗ binnacle.place(below-composer) threw: no model'),
    'the line below names its own registration',
  )
})

test('out of the box, the line under the composer names the model the session runs, muted', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  assert.equal((await terminal.altScreen()).at(-1), 'deepseek/deepseek-v4')
  assert.ok(terminal.written.includes('\x1b[90mdeepseek/deepseek-v4\x1b[39m'), 'the model is drawn in the muted tone')
})

test('the line names the model the session last asked for, and before its first request the one it opened on', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  session.asked = { provider: 'moonshot', model: 'kimi-k2' }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'moonshot/kimi-k2')
})

test('the line names the tokens the session used and the share of its context, each as it is measured', async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  session.projections = { tokenUsage: { uncachedInputTokens: 12_000, outputTokens: 400, cacheReadTokens: 0 } }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4 · 12.4k tokens')
  session.projections = {
    tokenUsage: { uncachedInputTokens: 12_000, outputTokens: 400, cacheReadTokens: 0 },
    contextPressure: { projectedTokens: 12_400, contextWindow: 32_768 },
  }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4 · 12.4k tokens · 38% of context')
})

/** An offer a person chooses, labelled by its id. */
const chosen = (id: string): Node => ({
  kind: 'offer',
  id,
  affordances: [{ kind: 'choose', label: id }],
  child: { kind: 'text', text: id },
})

/** What a prompt entry holds, as an ask's title names it. */
const sent = (entry: Entry): string => (entry.kind === 'prompt' && entry.fact.blocks[0]?.kind === 'text' ? entry.fact.blocks[0].text : '')

/** An ask a placement draws, naming the prompt's mark, the facts it is handed, and — where its place gives them — the keys that answer it. */
const seatedAsk =
  (what: string): ((facts: readonly Fact[]) => Node) =>
  (facts) => ({
    kind: 'ask',
    title: what,
    child: {
      kind: 'stack',
      children: [{ kind: 'text', text: [{ mark: 'prompt' }, ` ${what} ${facts.length}`] }, chosen(`on ${what}`)],
    },
  })

/** A titled fold holding three lines folded away, one row while it stands. */
const held = (id: string): Node => ({
  kind: 'fold',
  id,
  rows: 0,
  title: [{ mark: 'prompt' }, ` ${id}`],
  child: { kind: 'text', text: 'w\nx\ny' },
})

test('an ask a plugin places in the dialog names on its bottom edge the keys the one key table binds, as a person rebinds them', async () => {
  const terminal = new XtermTerminal(50, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('dialog', {
        kind: 'lines',
        draw: () => ({ kind: 'ask', title: 'pick', child: { kind: 'stack', children: [chosen('a'), chosen('b')] } }),
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === '     ╰─ enter select · tab/down next ───────╯'))
  await ctx.plugin({
    name: 'rebinder',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.primary': 'space' })
    },
  })
  await until(async () => (await terminal.altScreen()).some((row) => row === '     ╰─ space select · tab/down next ───────╯'))
})

test("an ask an author's view draws in the transcript names the keys that answer it, as a person rebinds them", async () => {
  const terminal = new XtermTerminal(50, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.view('prompt', () => ({ kind: 'ask', title: 'pick', child: { kind: 'stack', children: [chosen('a'), chosen('b')] } }))
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === '╰─ enter select · tab/down next ─────────────────╯'))
  await ctx.plugin({
    name: 'rebinder',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.primary': 'space' })
    },
  })
  await until(async () => (await terminal.altScreen()).some((row) => row === '╰─ space select · tab/down next ─────────────────╯'))
})

test('an ask placed above the composer names no keys on its bottom edge, for no key reaches it', async () => {
  const terminal = new XtermTerminal(50, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', {
        kind: 'lines',
        draw: () => ({ kind: 'ask', title: 'pick', child: { kind: 'stack', children: [chosen('a'), chosen('b')] } }),
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.startsWith('╭─ pick')))
  const bottom = (await terminal.altScreen()).find((row) => row.startsWith('╰'))
  assert.equal(bottom, `╰${'─'.repeat(48)}╯`)
})

test('lines that read what no session event announces are drawn again when their plugin asks', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const read = { count: 0 }
  const plugin: { redraw?: () => void } = {}
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', { kind: 'lines', draw: () => ({ kind: 'text', text: `read ${read.count}` }) })
      plugin.redraw = () => {
        author.binnacle.redraw()
      }
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === 'read 0'))
  read.count = 1
  plugin.redraw?.()
  await until(async () => (await terminal.altScreen()).some((row) => row === 'read 1'))
})

test("the line follows the token meter's own change feed, not only the session's events", async () => {
  const terminal = new XtermTerminal(60, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4')
  session.projections = { tokenUsage: { uncachedInputTokens: 900, outputTokens: 100, cacheReadTokens: 0 } }
  session.projectionsChanged()
  await until(async () => (await terminal.altScreen()).at(-1) === 'deepseek/deepseek-v4 · 1k tokens')
})

test("a notice stands in the line's place while one stands, and the line returns once it goes", async () => {
  const terminal = new XtermTerminal(50, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
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
  const { ctx, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('below-composer', { kind: 'lines', draw: () => ({ kind: 'text', text: ['elapsed ', { since: 1_000 }] }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === 'elapsed 0s'))
  clock.advance(4_000)
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === 'elapsed 3s'))
})

test('a screen a plugin places that says the time since a moment counts up as it passes, open', async () => {
  const terminal = new XtermTerminal(40, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
  await placesAScreen(ctx, () => ({ kind: 'text', text: ['up ', { since: 0 }] }))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === 'up 0s'))
  clock.advance(2_000)
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === 'up 2s'))
})

test('a quit key a plugin rebinds quits, and the key it had no longer does', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.quit': 'ctrl+q' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
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
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'tui.input.submit': 'ctrl+s' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
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
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.screen.trajectory': 'f2' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x0f')
  await settle()
  assert.equal(
    (await terminal.altScreen()).some((row) => row.includes('before turn 1')),
    false,
  )
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('before turn 1')))
})

test('disposing the plugin that rebound quit gives ctrl+c back', async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.keys({ 'binnacle.quit': 'ctrl+q' })
    },
  })
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

test('a key a plugin binds to expand opens the focused card, and one bound to copy writes all it holds to the clipboard: natively where the platform can, by OSC 52 where not', async () => {
  // Tall enough for the card's head and all it returned, once open.
  const terminal = new XtermTerminal(40, 9)
  const session = new FakeSession([called(13, 'read'), returned(14, 13, 'w\nx\ny\nz')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.expand': 'f6', 'binnacle.copy': 'f7' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('… 1 more line')))
  terminal.type('\x1b[Z')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('▸ show 1 more line')))
  terminal.type('\x1b[18~')
  await until(() => terminal.written.includes(`\x1b]52;c;${Buffer.from('w\nx\ny\nz').toString('base64')}\x07`))
  const native: string[] = []
  host.internals.clipboard = () => ({
    getText: async () => null,
    getImage: async () => null,
    setText: async (text: string) => {
      native.push(text)
    },
  })
  const before = terminal.written.length
  terminal.type('\x1b[18~')
  await until(() => native.length === 1)
  assert.deepEqual(native, ['w\nx\ny\nz'])
  assert.equal(terminal.written.slice(before).includes('\x1b]52;'), false)
  terminal.type('\x1b[17~')
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '│ z'))
})

test('--help says Ctrl+C stops a running turn and quits only when pressed twice', async () => {
  const { out } = await mount(['--help'])
  assert.match(out.join(''), /Ctrl\+C stops a\s+running turn, and twice quits\./)
  assert.match(out.join(''), /\n  ctrl\+c  stop a running turn; pressed twice, quit\n/)
})

test("--help names each affordance's binding, unbound until a person binds it", async () => {
  const { out } = await mount(['--help'])
  assert.match(out.join(''), /  \(unbound\)  copy the focused thing\n/)
})

test("a plugin's composer placement decides what a submitted line does", async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const seen: string[] = []
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('composer', {
        kind: 'composer',
        submit: (text) => {
          seen.push(text.toUpperCase())
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
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

test("lines in the composer's seat that offer something take the keyboard: enter invokes the first offer, which reaches their invoke, and nothing is sent", async () => {
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
        draw: () => ({
          kind: 'stack',
          children: [
            {
              kind: 'offer',
              id: 'allow',
              affordances: [{ kind: 'grant', label: 'allow once' }],
              child: { kind: 'text', text: 'allow once' },
            },
            { kind: 'offer', id: 'reject', affordances: [{ kind: 'dismiss', label: 'reject' }], child: { kind: 'text', text: 'reject' } },
          ],
        }),
        invoke: (region, affordance) => {
          invoked.push(`${region} ${affordance}`)
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('allow once')))
  terminal.type('\r')
  assert.deepEqual(invoked, ['allow grant'])
  terminal.type('\t')
  terminal.type('\r')
  assert.deepEqual(invoked, ['allow grant', 'reject dismiss'])
  assert.deepEqual(session.sent, [])
})

test('lines placed in the dialog slot are drawn over the page, centred at four fifths of its width, and disposing them gives the page back', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('dialog', {
        kind: 'lines',
        draw: () => ({ kind: 'ask', title: 'note', child: { kind: 'text', text: 'hello' } }),
      })
    },
  })
  await until(
    async () =>
      (await terminal.altScreen()).slice(3, 6).join('\n') ===
      ['    ╭─ note ───────────────────────╮', '    │ hello                        │', '    ╰──────────────────────────────╯'].join('\n'),
  )
  await (await author).dispose()
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('hello')))
})

test("a dialog that offers something takes the keyboard ahead of the composer's seat, and gives it back once disposed", async () => {
  const terminal = new XtermTerminal(40, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const invoked: string[] = []
  const offering = (id: string): Extract<Placement, { readonly kind: 'lines' }> => ({
    kind: 'lines',
    draw: () => ({ kind: 'offer', id, affordances: [{ kind: 'grant', label: id }], child: { kind: 'text', text: id } }),
    invoke: (region) => {
      invoked.push(region)
    },
  })
  await ctx.plugin({
    name: 'seat',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('composer', offering('seated'))
    },
  })
  const dialog = ctx.plugin({
    name: 'dialog',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('dialog', offering('asked'))
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('asked')))
  terminal.type('\r')
  assert.deepEqual(invoked, ['asked'])
  await (await dialog).dispose()
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('asked')))
  terminal.type('\r')
  assert.deepEqual(invoked, ['asked', 'seated'])
})

test('the dialog stands over whichever screen the person switches to, and answers there', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  const invoked: string[] = []
  await ctx.plugin({
    name: 'dialog',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('dialog', {
        kind: 'lines',
        draw: () => ({ kind: 'offer', id: 'asked', affordances: [{ kind: 'grant' }], child: { kind: 'text', text: 'asked' } }),
        invoke: (region) => {
          invoked.push(region)
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === '    asked'))
  terminal.type('\x14')
  await until(async () => !(await terminal.onAlternateScreen()) && (await terminal.mainScreen()).some((row) => row.startsWith('    asked')))
  terminal.type('\r')
  assert.deepEqual(invoked, ['asked'])
  terminal.type('\x14')
  await until(async () => (await terminal.onAlternateScreen()) && (await terminal.altScreen()).some((row) => row === '    asked'))
})

test('quitting leaves the session printed on the main screen without the dialog that stood over it', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit, exits } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'dialog',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('dialog', { kind: 'lines', draw: () => ({ kind: 'text', text: 'asked' }) })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === '    asked'))
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length === 1)
  const left = await terminal.mainScreen()
  assert.ok(
    left.some((row) => row.includes('fix the build')),
    'the session is left printed',
  )
  assert.ok(
    left.every((row) => !row.includes('asked')),
    'the dialog is not',
  )
})

test('quitting from the main screen leaves the session printed there without the dialog', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit, exits } = await mount(['--tui-mode', 'regular'], session, async () => session, terminal)
  await ctx.plugin({
    name: 'dialog',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.place('dialog', { kind: 'lines', draw: () => ({ kind: 'text', text: 'asked' }) })
    },
  })
  commit()
  await until(async () => (await terminal.mainScreen()).some((row) => row.startsWith('    asked')))
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => exits.length === 1)
  const left = await terminal.mainScreen()
  assert.ok(
    left.some((row) => row.includes('fix the build')),
    'the session is left printed',
  )
  assert.ok(
    left.every((row) => !row.includes('asked')),
    'the dialog is not',
  )
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
const askApprovalFor = (
  ctx: Context,
  agent: Agent,
  req: Omit<Parameters<Events['approval/request']>[0], 'agent'>,
): Promise<ApprovalOutcome> =>
  ctx.waterfall(scopeTarget(agent, agent), 'approval/request', { agent: {} as never, ...req }, () =>
    Promise.resolve<ApprovalOutcome>('unavailable'),
  )

test("an approval another agent asks is not binnacle's to answer: no card seats, and it settles as nothing answered", async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const foreign = {} as Agent
  const outcome = askApprovalFor(ctx, foreign, { toolName: 'bash', reason: 'another agent asks' })
  await settle()
  assert.ok(
    (await terminal.altScreen()).every((row) => !row.includes('another agent asks')),
    "another agent's ask seats no card",
  )
  assert.equal(
    await Promise.race([outcome, settle().then(() => 'still standing' as const)]),
    'unavailable',
    "another agent's ask settles as nothing answered",
  )
  // The session\'s own agent is still answered, asked the same scoped way.
  const mine = askApprovalFor(ctx, session.agent, { toolName: 'bash', reason: 'the session asks' })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('the session asks')))
  terminal.type('\r')
  assert.equal(await mine, 'allowed-once')
})

test("an approval asked sits in the composer's seat, naming the tool and why, and enter allows it once, giving the composer back", async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('draft')
  const outcome = askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('writes outside the workspace')))
  const card = await terminal.altScreen()
  assert.ok(
    card.some((row) => row.includes('bash asks')),
    'the card names the tool',
  )
  assert.ok(card.some((row) => row.includes('allow once')) && card.some((row) => row.includes('reject')), 'the card offers both')
  terminal.type('\r')
  assert.equal(await outcome, 'allowed-once')
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('writes outside the workspace')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['draft'])
})

test('a click on the card does nothing, allow once or reject: an approval is a key pressed on purpose; tab and enter reject', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => {
    settled = outcome
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('allow once')))
  const rows = await terminal.altScreen()
  // The pointer reports a cell 1-based, where the rows read back are 0-based.
  for (const offer of ['allow once', 'reject']) {
    const row = rows.findIndex((line) => line.includes(offer))
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
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => {
    settled = outcome
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('allow once')))
  terminal.type('\x03')
  terminal.type('\x03')
  await until(() => settled !== undefined)
  assert.equal(settled, 'unavailable')
  await settle()
  assert.deepEqual(exits, [0])
  assert.ok(
    (await terminal.mainScreen()).every((row) => !row.includes('allow once')),
    'the card is gone from what the session left printed',
  )
})

test('an approval withdrawn by its signal takes its card back, settled cancelled', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const withdraw = new AbortController()
  const outcome = askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace', signal: withdraw.signal })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('allow once')))
  withdraw.abort()
  assert.equal(await outcome, 'cancelled')
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('allow once')))
})

test('the key a person binds to dismiss rejects an approval while allow once has focus', async () => {
  const terminal = new XtermTerminal(50, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.dismiss': 'f8' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  let settled: ApprovalOutcome | undefined
  void askApproval(ctx, { toolName: 'bash', reason: 'writes outside the workspace' }).then((outcome) => {
    settled = outcome
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('allow once')))
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
const askQuestionsFor = (
  ctx: Context,
  agent: Agent,
  req: Omit<Parameters<Events['user-questions/request']>[0], 'agent'>,
): Promise<AskUserQuestionAnswer> =>
  ctx.waterfall(scopeTarget(agent, agent), 'user-questions/request', { agent, ...req }, () =>
    Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER')),
  )

test("a question another agent asks is not binnacle's to answer: no card seats, and it fails as nothing answered", async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const foreign = {} as Agent
  const answer = askQuestionsFor(ctx, foreign, { questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }] })
  const refusal = await answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  await settle()
  assert.ok(
    (await terminal.altScreen()).every((row) => !row.includes('which database?')),
    "another agent's question seats no card",
  )
  assert.equal(
    refusal instanceof Error && refusal.name === 'UserQuestionError' && (refusal as { code?: string }).code === 'NO_PROVIDER',
    true,
    "another agent's ask fails as nothing answered",
  )
  // The session\'s own agent is still answered, asked the same scoped way.
  const mine = askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q2', question: 'which port?', options: [{ label: '5432' }] }] })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which port?')))
  terminal.type('\r')
  assert.deepEqual(await mine, { answers: [{ id: 'q2', selected: ['5432'] }] })
})

test("a question asked sits in the composer's seat, naming the question, and enter chooses its first option, answering it", async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [
      {
        id: 'q1',
        header: 'Set up',
        question: 'which database?',
        detail: 'The workspace has no database yet.',
        options: [{ label: 'postgres' }, { label: 'sqlite' }],
      },
    ],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  const card = await terminal.altScreen()
  assert.ok(
    card.some((row) => row.includes('Set up')),
    'the card titles itself with the header',
  )
  assert.ok(
    card.some((row) => row.includes('The workspace has no database yet.')),
    'the card draws the detail',
  )
  assert.ok(card.some((row) => row.includes('postgres')) && card.some((row) => row.includes('sqlite')), 'the card offers both options')
  assert.ok(
    card.some((row) => row.includes('type an answer')) &&
      card.some((row) => row.includes('skip')) &&
      card.some((row) => row.includes('cancel')),
    'the card offers typing, skipping and cancelling',
  )
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['postgres'] }] })
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))
})

test('skip answers a question with nothing selected, and the next question takes the seat', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [
      { id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] },
      { id: 'q2', question: 'which port?', options: [{ label: '5432' }, { label: '8080' }] },
    ],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which port?')))
  assert.ok(
    (await terminal.altScreen()).every((row) => !row.includes('which database?')),
    "the first question's card is gone",
  )
  terminal.type('\r')
  assert.deepEqual(await answer, {
    answers: [
      { id: 'q1', selected: [] },
      { id: 'q2', selected: ['5432'] },
    ],
  })
})

test('a multi-select question answers with every option marked, once done is chosen', async () => {
  const terminal = new XtermTerminal(50, 18)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [
      {
        id: 'q1',
        question: 'which checks should run?',
        multiSelect: true,
        options: [{ label: 'types' }, { label: 'lint' }, { label: 'tests' }],
      },
    ],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which checks should run?')))
  assert.ok(
    (await terminal.altScreen()).some((row) => row.includes('done')),
    'a multi-select question offers done',
  )
  terminal.type('\r')
  // The marked option's line draws the done mark beside its label.
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('● types')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('● tests')))
  terminal.type('\t')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['types', 'tests'] }] })
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which checks should run?')))
})

test('type an answer places a composer in the seat, whose submitted line is the custom answer; a blank line gives the card back', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] }],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  assert.ok(
    (await terminal.altScreen()).some((row) => row.includes('skip')),
    'the card is back',
  )
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  terminal.type('whatever runs')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('whatever runs')))
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'whatever runs' }] })
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))
})

test('cancel rejects the request as cancelled, and the composer returns with what was typed', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.dismiss': 'f8' })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('draft')
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  terminal.type('\x1b[19~')
  const refusal = await answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  assert.equal(refusal instanceof Error && refusal.name === 'UserQuestionError', true, 'the refusal is a UserQuestionError')
  assert.equal((refusal as { code?: string }).code, 'ASK_CANCELLED')
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))
  terminal.type('\r')
  assert.deepEqual(session.sent, ['draft'])
})

test('a request withdrawn by its signal takes its card back, rejected as aborted', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const withdraw = new AbortController()
  const answer = askQuestionsFor(ctx, session.agent, {
    signal: withdraw.signal,
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  withdraw.abort()
  const refusal = await answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  assert.equal(refusal instanceof Error && refusal.name === 'UserQuestionError', true, 'the refusal is a UserQuestionError')
  assert.equal((refusal as { code?: string }).code, 'ASK_ABORTED')
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))
})

test('a request already withdrawn when it arrives seats nothing and is rejected as aborted', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const withdraw = new AbortController()
  withdraw.abort()
  const answer = askQuestionsFor(ctx, session.agent, {
    signal: withdraw.signal,
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }],
  })
  const refusal = await answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  assert.equal((refusal as { code?: string }).code, 'ASK_ABORTED')
  await settle()
  assert.ok(
    (await terminal.altScreen()).every((row) => !row.includes('which database?')),
    'no card was seated',
  )
})

test('a plan-review question is drawn the same way, its plan as markdown and its approve option primary', async () => {
  const terminal = new XtermTerminal(50, 18)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [
      {
        id: 'q1',
        header: 'Plan review',
        question: 'does this plan do it?',
        detail: '## The plan\n\n1. read the code\n2. write the test',
        intent: { kind: 'plan-review', approve: 'ship it' },
        options: [{ label: 'rethink it' }, { label: 'ship it' }],
      },
    ],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('does this plan do it?')))
  const card = await terminal.altScreen()
  assert.ok(
    card.some((row) => row.includes('The plan')),
    'the card draws the plan',
  )
  assert.ok(
    card.some((row) => row.includes('read the code')),
    "the plan's steps are drawn",
  )
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['ship it'] }] })
})

test('while the composer holds the seat the question stays readable above it, asked once, offering nothing', async () => {
  const terminal = new XtermTerminal(50, 20)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [
      {
        id: 'q1',
        header: 'Set up',
        question: 'which database?',
        detail: 'The workspace has no database yet.',
        options: [{ label: 'postgres' }, { label: 'sqlite' }],
      },
    ],
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(async () => {
    const rows = await terminal.altScreen()
    return (
      rows.some((row) => row.includes('which database?')) &&
      rows.some((row) => row.includes('The workspace has no database yet.')) &&
      rows.every((row) => !row.includes('skip'))
    )
  })
  assert.equal((await terminal.altScreen()).filter((row) => row.includes('which database?')).length, 1, 'the question is asked once')
  terminal.type('whatever runs')
  terminal.type('\r')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: [], custom: 'whatever runs' }] })
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))
  terminal.type('\r')
  assert.deepEqual(session.sent, [], 'the line answered the question; nothing was sent')
})

test("a click on a question's option chooses it, and a click on cancel cancels nothing, for dismiss refuses the pointer", async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  let settled: AskUserQuestionAnswer | undefined
  void askQuestionsFor(ctx, session.agent, {
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }, { label: 'sqlite' }] }],
  }).then((answer) => {
    settled = answer
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  const rows = await terminal.altScreen()
  const optionRow = rows.findIndex((line) => line.includes('postgres'))
  click(terminal, (rows[optionRow]?.indexOf('postgres') ?? 0) + 1, optionRow + 1)
  await until(() => settled !== undefined)
  assert.deepEqual(settled, { answers: [{ id: 'q1', selected: ['postgres'] }] })
  await until(async () => (await terminal.altScreen()).every((row) => !row.includes('which database?')))

  let refused: unknown
  void askQuestionsFor(ctx, session.agent, { questions: [{ id: 'q2', question: 'which port?', options: [{ label: '5432' }] }] }).then(
    () => {},
    (reason: unknown) => {
      refused = reason
    },
  )
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which port?')))
  const asking = await terminal.altScreen()
  const cancelRow = asking.findIndex((line) => line.includes('cancel'))
  click(terminal, (asking[cancelRow]?.indexOf('cancel') ?? 0) + 1, cancelRow + 1)
  await settle()
  assert.ok(refused === undefined, 'a click on cancel cancels nothing')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\t')
  terminal.type('\r')
  await until(() => refused !== undefined)
  const reason: unknown = refused
  assert.equal(
    reason instanceof Error && reason.name === 'UserQuestionError' && (reason as { code?: string }).code === 'ASK_CANCELLED',
    true,
    'tab and enter cancel the ask',
  )
})

test('an ask still standing when the session closes goes to the next answerer, and its card is gone from what it left', async () => {
  const terminal = new XtermTerminal(50, 16)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, exits, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  const answer = askQuestionsFor(ctx, session.agent, {
    questions: [{ id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] }],
  })
  const refusal = answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('which database?')))
  terminal.type('\x03')
  terminal.type('\x03')
  const reason = await refusal
  assert.equal(
    reason instanceof Error && reason.name === 'UserQuestionError' && (reason as { code?: string }).code === 'NO_PROVIDER',
    true,
    'the ask went to the next answerer, and none answered',
  )
  await settle()
  assert.deepEqual(exits, [0])
  assert.ok(
    (await terminal.mainScreen()).every((row) => !row.includes('which database?')),
    'the card is gone from what the session left printed',
  )
})

test("lines read what dsh knows of the session from the agent on screen and dsh's services, and are drawn again as it changes", async () => {
  const terminal = new XtermTerminal(60, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle', 'sessionProjections'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', {
        kind: 'lines',
        draw: () => {
          const agent = author.binnacle.agent()
          const output = author.sessionProjections.snapshot(agent.session, ['tokenUsage']).values.tokenUsage?.outputTokens ?? 0
          return {
            kind: 'text',
            text: `${agent.session.requestHeader()?.config.model ?? agent.options.model} ${agent.status === 'running' ? 'working' : 'idle'} ${output}`,
          }
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row === 'deepseek-v4 idle 0'))
  session.asked = { provider: 'moonshot', model: 'kimi-k2' }
  session.running = true
  session.projections = { tokenUsage: { uncachedInputTokens: 1200, outputTokens: 340, cacheReadTokens: 0 } }
  session.standsChanged()
  await until(async () => (await terminal.altScreen()).some((row) => row === 'kimi-k2 working 340'))
})

/** A plugin that places the notice the session stands at above the composer, or nothing. */
const placesTheNotice = (ctx: Context) =>
  ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('above-composer', { kind: 'lines', draw: (_facts, surface) => ({ kind: 'text', text: surface.notice ?? '' }) })
    },
  })

test('ctrl+c mid-turn interrupts the turn and says a second quits, and a second within three seconds quits', async () => {
  const terminal = new XtermTerminal(50, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { ctx, exits, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
  await placesTheNotice(ctx)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  session.running = true
  terminal.type('\x03')
  assert.equal(session.interrupted, 1)
  await until(async () => (await terminal.altScreen()).some((row) => row === 'ctrl+c again to quit'))
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
  const { ctx, exits, commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
  await placesTheNotice(ctx)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x03')
  await until(async () => (await terminal.altScreen()).some((row) => row === 'ctrl+c again to quit'))
  assert.equal(session.interrupted, 0)
  clock.advance(3_000)
  await until(async () => (await terminal.altScreen()).every((row) => row !== 'ctrl+c again to quit'))
  terminal.type('\x03')
  await settle()
  assert.deepEqual(exits, [])
})

test('a composer placement whose submit throws is named in a notice, and the surface stays up', async () => {
  const terminal = new XtermTerminal(60, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesTheNotice(ctx)
  await ctx.plugin({
    name: 'composer author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('composer', {
        kind: 'composer',
        submit: () => {
          throw new Error('no network')
        },
      })
    },
  })
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('hello')
  terminal.type('\r')
  await until(async () => (await terminal.altScreen()).some((row) => row === 'binnacle.place(composer) submit threw: no network'))
})

test('a running call counts up once a second, and stops counting once it returns', async () => {
  const terminal = new XtermTerminal(40, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const clock = new FakeClock()
  const { commit } = await mount(
    [],
    session,
    async () => session,
    terminal,
    async () => {},
    clock,
  )
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  clock.advance(3)
  session.log(called(3, 'read'))
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '│ running 0s'))
  clock.advance(4_000)
  await until(async () => (await terminal.altScreen()).some((row) => row.trim() === '│ running 4s'))
  session.log(returned(4, 3, 'the file'))
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('the file')))
  assert.equal(
    (await terminal.altScreen()).some((row) => row.includes('running')),
    false,
  )
})

test("a /name line naming one of the session's commands runs it and is not sent, and one naming none is sent as prose", async () => {
  const terminal = new XtermTerminal(40, 8)
  const session = new FakeSession([prompt(1, 'fix the build')])
  session.commands.set('compact', 'summarize the session so far')
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('/compact now')
  terminal.type('\r')
  await until(() => session.ran.length > 0)
  assert.deepEqual(session.ran, ['/compact now'])
  terminal.type('/nothing here')
  terminal.type('\r')
  await until(() => session.sent.length > 0)
  assert.deepEqual(session.sent, ['/nothing here'])
})

test("typing / offers the session's commands and the skills a person may invoke, as dsh lists them", async () => {
  const terminal = new XtermTerminal(60, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  session.commands.set('compact', 'summarize the session so far')
  session.skills.set('review', 'review a change')
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('/')
  await until(async () => {
    const rows = await terminal.altScreen()
    return (
      rows.some((row) => row.includes('compact') && row.includes('summarize the session so far')) &&
      rows.some((row) => row.includes('review') && row.includes('review a change'))
    )
  })
})

test("an open / list is drawn in the theme's tones, its chosen row accent and the rest's descriptions muted, as a registration comes and goes", async () => {
  const terminal = new XtermTerminal(60, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  session.commands.set('compact', 'summarize the session so far')
  session.skills.set('review', 'review a change')
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('/')
  const drawnIn = (accent: string, muted: string) =>
    terminal.written.includes(`\x1b[${accent}m→ compact`) && terminal.written.includes(`\x1b[${muted}m      review a change\x1b[39m`)
  await until(() => drawnIn('36', '90'))
  terminal.written = ''
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ tones: { accent: { color: 'magenta' }, muted: { color: 'yellow' } } })
    },
  })
  await author
  await until(() => drawnIn('35', '33'))
  terminal.written = ''
  await author.dispose()
  await until(() => drawnIn('36', '90'))
})

test('what / offers follows dsh: a command registered after the session opened is offered once dsh says so', async () => {
  const terminal = new XtermTerminal(60, 14)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  session.commands.set('plan', 'plan before acting')
  session.offersChanged()
  await settle()
  terminal.type('/')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('plan before acting')))
})

test("on the fullscreen, an open search's matches are drawn in pi's searchMatchText on searchMatchBg, the current one bold too, as a registration comes and goes", async () => {
  const terminal = new XtermTerminal(40, 30)
  const session = new FakeSession(folded)
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('read6')))
  terminal.type('\x1b[102;6u')
  terminal.type('read')
  const drawnIn = (code: string) => {
    const current = `\x1b[1m${code}read\x1b[39m${code.includes('[4') ? '\x1b[49m' : ''}\x1b[22m`
    const other = `${code}read\x1b[39m${code.includes('[4') ? '\x1b[49m' : ''}`
    return terminal.written.includes(current) && terminal.written.replaceAll(current, '').includes(other)
  }
  await until(() => drawnIn('\x1b[36m'))
  terminal.written = ''
  const author = ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (plugin: Context) => {
      plugin.binnacle.theme({ tones: { searchMatchText: { color: 'magenta' } }, backgrounds: { searchMatchBg: 'blue' } })
    },
  })
  await author
  await until(() => drawnIn('\x1b[44m\x1b[35m'))
  terminal.written = ''
  await author.dispose()
  await until(() => drawnIn('\x1b[36m'))
})

test('a lines placement below the composer is drawn again after a key is rebound and after a theme change', async () => {
  const terminal = new XtermTerminal(50, 12)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  let drew = 0
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.place('below-composer', {
        kind: 'lines',
        draw: () => ({ kind: 'text', text: [{ mark: 'prompt' }, ` drew ${++drew}`] }),
      })
    },
  })
  commit()
  const drawings = async (): Promise<number> =>
    Number((await terminal.altScreen()).find((row) => row.includes('drew '))?.match(/drew (\d+)/)?.[1] ?? 0)
  await until(async () => (await drawings()) === 1)
  // Let the terminal's colour query settle first, so a re-theme in its own moment cannot move the count below.
  await new Promise((resolve) => setTimeout(resolve, 250))
  const beforeRebind = await drawings()
  await ctx.plugin({
    name: 'rebinder',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.primary': 'space' })
    },
  })
  await until(async () => (await drawings()) > beforeRebind)
  const beforeTheme = await drawings()
  await ctx.plugin({
    name: 'themer',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.theme({ marks: { prompt: { glyph: '>' } } })
    },
  })
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('> drew ')) && (await drawings()) > beforeTheme
  })
})

test("a placed screen's focus is brought into view after switching to the transcript and back", async () => {
  const terminal = new XtermTerminal(50, 10)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await placesAScreen(ctx, () => ({
    kind: 'stack',
    children: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map(held),
  }))
  commit()
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('› one · 3 lines')))
  terminal.type('\x1b[Z')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('▸ › eight · show 3 more lines')) && rows.every((row) => !row.includes('› one ·'))
  })
  terminal.type('\x1bOQ')
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('fix the build')))
  terminal.type('\x1bOQ')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('▸ › eight · show 3 more lines')) && rows.every((row) => !row.includes('› one ·'))
  })
  for (let step = 0; step < 7; step++) terminal.type('\x1b[A')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('▸ › one · show 3 more lines')) && rows.every((row) => !row.includes('› eight ·'))
  })
})

test('a pane seated in any place is invalidated by a theme change, a key table change and a fact, through one walk', async () => {
  const terminal = new XtermTerminal(60, 20)
  const session = new FakeSession([prompt(1, 'fix the build')])
  const { ctx, commit } = await mount([], session, async () => session, terminal)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.view('prompt', (entry) => ({
        kind: 'ask',
        title: 'the session',
        child: {
          kind: 'stack',
          children: [{ kind: 'text', text: [{ mark: 'prompt' }, ` ${sent(entry)}`] }, chosen('a')],
        },
      }))
      author.binnacle.place('above-composer', { kind: 'lines', draw: seatedAsk('above') })
      author.binnacle.place('composer', { kind: 'lines', draw: seatedAsk('seated') })
      author.binnacle.screen('board', { key: 'f3', description: 'the board', draw: seatedAsk('board') })
    },
  })
  commit()
  await until(async () => {
    const rows = await terminal.altScreen()
    return (
      rows.some((row) => row.includes('› fix the build')) &&
      rows.some((row) => row.includes('› above 1')) &&
      rows.some((row) => row.includes('› seated 1')) &&
      rows.some((row) => row.includes('enter select'))
    )
  })
  // Let the terminal's colour query settle first, so a re-theme in its own moment cannot drop a cache below.
  await new Promise((resolve) => setTimeout(resolve, 250))
  terminal.type('\x1bOR')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('› board 1')) && rows.some((row) => row.includes('enter select'))
  })
  session.log(prompt(2, 'and the tests'))
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('› board 2')))
  await ctx.plugin({
    name: 'themer',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.theme({ marks: { prompt: { glyph: '>' } } })
    },
  })
  await until(async () => (await terminal.altScreen()).some((row) => row.includes('> board 2')))
  terminal.type('\x1bOR')
  await until(async () => {
    const rows = await terminal.altScreen()
    return (
      rows.some((row) => row.includes('> and the tests')) &&
      rows.some((row) => row.includes('> above 2')) &&
      rows.some((row) => row.includes('enter select'))
    )
  })
  await ctx.plugin({
    name: 'rebinder',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.keys({ 'binnacle.primary': 'space' })
    },
  })
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('space select')) && rows.every((row) => !row.includes('enter select'))
  })
  terminal.type('\x1bOR')
  await until(async () => {
    const rows = await terminal.altScreen()
    return rows.some((row) => row.includes('> board 2')) && rows.some((row) => row.includes('space select'))
  })
})
