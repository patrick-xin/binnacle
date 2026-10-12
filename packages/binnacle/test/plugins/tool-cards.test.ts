import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { TranscriptState } from '../../src/plugins/transcript/index.ts'
import type {
  Card,
  CardBodyLook,
  CardLook,
  CardMarkLook,
  CardMostLook,
  CardTimeLook,
  CardTitleLook,
} from '../../src/plugins/tool-cards/index.ts'
import { frame } from '../../src/index.ts'
import { mounted } from '../support/mounted.ts'

const ENTER = '\r'
const UP = '\x1b[A'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`
const RED = 1
const GREEN = 2
const YELLOW = 3
const CYAN = 6
const BRIGHT_BLACK = 8

type Event = { seq: number; type: string; time: number; data: unknown }

interface Tool {
  presentCall?(args: unknown): unknown
  presentResult?(args: unknown, result: { content: unknown[]; isError: boolean; meta?: unknown }): unknown
}

const at = (seq: number, type: string, data: unknown, time = seq * 1000): Event => ({ seq, type, time, data })
const prompt = (seq: number, text: string) =>
  at(seq, 'user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
const call = (seq: number, name: string, args: string, id = `c${seq}`) =>
  at(seq, 'tool/call', { turn: 1, step: 1, callId: id, name, arguments: args })
const result = (seq: number, id: string, text: string, options: { isError?: boolean; time?: number; meta?: unknown } = {}) =>
  at(
    seq,
    'tool/result',
    {
      turn: 1,
      step: 1,
      message: { role: 'tool', toolCallId: id, isError: options.isError ?? false, content: text === '' ? [] : [{ type: 'text', text }] },
      ...(options.meta !== undefined && { meta: options.meta }),
    },
    options.time ?? seq * 1000,
  )

function toolsOf(tools: Readonly<Record<string, Tool>>) {
  const asked: { name: string; scope: unknown }[] = []
  return {
    asked,
    service: {
      get: (name: string, scope?: unknown) => {
        asked.push({ name, scope })
        return tools[name]
      },
    },
  }
}

const BUILT_INS = ['binnacle-transcript', 'binnacle-transcript-view', 'binnacle-tool-cards']

async function reading(events: readonly Event[], tools: Readonly<Record<string, Tool>> = {}, rows = 16, columns = 40) {
  const service = toolsOf(tools)
  const mount = await mounted({
    size: { columns, rows },
    builtins: BUILT_INS,
    stored: { id: 'session-stored', events: events as never },
    provide: (ctx) => ctx.provide('tools' as never, service.service as never),
  })
  const drawn = async () => (await mount.terminal.read()).rows
  return { ...mount, plugin: mount.row('binnacle-tool-cards'), asked: service.asked, drawn }
}

async function talking(tools: Readonly<Record<string, Tool>> = {}, rows = 12) {
  const service = toolsOf(tools)
  const mount = await mounted({
    size: { columns: 40, rows },
    builtins: BUILT_INS,
    provide: (ctx) => ctx.provide('tools' as never, service.service as never),
  })
  return { ...mount, asked: service.asked, drawn: async () => (await mount.terminal.read()).rows }
}

const stateOf = (ctx: Context) => ctx.binnacle.modelOf<TranscriptState>('transcript')

const shell: Tool = {
  presentCall: (args) => ({ card: 'terminal', title: (args as { command: string }).command, description: 'List the files', cwd: '/repo' }),
  presentResult: (_, { meta }) => ({ card: 'terminal', ...(meta as object) }),
}

test('a tool call and its result draw as one card where the call is: its first line, then its body, then a blank line', async () => {
  const { drawn } = await reading(
    [prompt(0, 'hi'), call(1, 'bash', '{"command":"ls"}'), result(2, 'c1', 'a.ts', { meta: { output: 'a.ts\nb.ts\n', exitCode: 0 } })],
    { bash: shell },
  )
  assert.deepEqual((await drawn()).slice(0, 6), ['› hi', '', '⏺ ls · 1.0s', '  ⎿ a.ts', '    b.ts', ''])
})

test("a card's first line is ⏺ and the call view's title, or the tool's name, cut at the width beside its time", async () => {
  const { drawn } = await reading(
    [call(0, 'bash', '{"command":"a very long command that goes on and on"}'), result(1, 'c0', '', { meta: {} }), call(2, 'mystery', '{}')],
    { bash: shell },
  )
  assert.deepEqual((await drawn()).slice(0, 4), ['⏺ a very long command that goes … · 1.0s', '', '⏺ mystery', '  ⎿ {}'])
})

test('the ⏺ is in the accent Tone while the call runs, success when it is done, and error when it failed, and the time is muted', async () => {
  const { drawn, terminal } = await reading([
    call(0, 'ls', '{}'),
    result(1, 'c0', 'a.ts'),
    call(2, 'ls', '{}'),
    result(3, 'c2', 'no', { isError: true }),
    call(4, 'ls', '{}'),
  ])
  await drawn()
  const colours = await Promise.all([0, 3, 6].map((y) => terminal.colourAt(0, y)))
  assert.deepEqual(colours, [GREEN, RED, CYAN])
  assert.equal(await terminal.colourAt(8, 0), BRIGHT_BLACK)
})

test('a time under a minute draws as 1.2s, and after a minute as m:ss', async () => {
  const { drawn } = await reading([
    call(0, 'ls', '{}'),
    result(1, 'c0', '', { time: 1234 }),
    call(2, 'ls', '{}'),
    result(3, 'c2', '', { time: 2000 + 75_000 }),
  ])
  assert.deepEqual((await drawn()).slice(0, 4), ['⏺ ls · 1.2s', '', '⏺ ls · 1:15', ''])
})

test('a terminal card draws the last 12 lines of the output after … <n> earlier lines, and exit <code> or signal <name> in the error Tone', async () => {
  const output = Array.from({ length: 14 }, (_, line) => `line ${line + 1}`).join('\n')
  const { drawn, terminal } = await reading(
    [
      call(0, 'bash', '{"command":"seq"}'),
      result(1, 'c0', '', { meta: { output, exitCode: 2 } }),
      call(2, 'bash', '{"command":"sleep"}'),
      result(3, 'c2', '', { meta: { signal: 'SIGTERM' } }),
    ],
    { bash: shell },
    24,
  )
  const rows = await drawn()
  assert.deepEqual(rows.slice(0, 3), ['⏺ seq · 1.0s', '  ⎿ … 2 earlier lines', '    line 3'])
  assert.deepEqual(rows.slice(13, 19), ['    line 14', '    exit 2', '', '⏺ sleep · 1.0s', '  ⎿ signal SIGTERM', ''])
  assert.deepEqual([await terminal.colourAt(4, 14), await terminal.colourAt(4, 17)], [RED, RED])
})

test('a diff card draws a line for each diff, <path> +<added> -<removed> in the success and error Tones, a new file counting every line', async () => {
  const edit: Tool = {
    presentResult: () => ({
      card: 'diff',
      diffs: [
        { path: 'a.ts', oldText: 'one\ntwo\nthree\n', newText: 'one\n2\nthree\nfour\n' },
        { path: 'a.ts', oldText: 'x', newText: 'x' },
        { path: 'new.ts', oldText: null, newText: 'a\nb\n' },
      ],
    }),
  }
  const { drawn, terminal } = await reading([call(0, 'edit', '{}'), result(1, 'c0', 'ok')], { edit })
  assert.deepEqual((await drawn()).slice(0, 4), ['⏺ edit · 1.0s', '  ⎿ a.ts +2 -1', '    a.ts +0 -0', '    new.ts +2 -0'])
  assert.deepEqual([await terminal.colourAt(9, 1), await terminal.colourAt(12, 1)], [GREEN, RED])
})

test('a search card draws <n> matches or <n> paths, and (truncated) in the warning Tone when dsh cut it', async () => {
  const grep: Tool = { presentResult: () => ({ card: 'search', shape: 'matches', files: [], truncated: true, total: 120 }) }
  const glob: Tool = { presentResult: () => ({ card: 'search', shape: 'paths', paths: ['a'], truncated: false, total: 1 }) }
  const { drawn, terminal } = await reading([call(0, 'grep', '{}'), result(1, 'c0', ''), call(2, 'glob', '{}'), result(3, 'c2', '')], {
    grep,
    glob,
  })
  assert.deepEqual((await drawn()).slice(0, 6), ['⏺ grep · 1.0s', '  ⎿ 120 matches (truncated)', '', '⏺ glob · 1.0s', '  ⎿ 1 paths', ''])
  assert.equal(await terminal.colourAt(17, 1), YELLOW)
})

test('a read card draws <n> lines of <total>', async () => {
  const read: Tool = {
    presentResult: () => ({
      card: 'read',
      path: 'a.ts',
      offset: 1,
      lines: [
        { number: 1, text: 'x' },
        { number: 2, text: 'y' },
      ],
      totalLines: 40,
    }),
  }
  const { drawn } = await reading([call(0, 'read', '{}'), result(1, 'c0', 'x\ny')], { read })
  assert.deepEqual((await drawn()).slice(0, 2), ['⏺ read · 1.0s', '  ⎿ 2 lines of 40'])
})

test("a web card draws its title, then the first 12 lines of the result's text", async () => {
  const fetch: Tool = {
    presentResult: () => ({ card: 'web', kind: 'fetch', title: 'Example', url: 'https://example.com', statusCode: 200, truncated: false }),
  }
  const text = Array.from({ length: 13 }, (_, line) => `l${line + 1}`).join('\n')
  const { drawn } = await reading([call(0, 'fetch', '{}'), result(1, 'c0', text)], { fetch }, 20)
  const rows = await drawn()
  assert.deepEqual([rows[1], rows[2], rows[13], rows[14]], ['  ⎿ Example', '    l1', '    l12', ''])
})

test("a generic card draws its title, then the first 12 lines of its content's text blocks, else of the result's text, and a result with no view its text", async () => {
  const titled: Tool = { presentResult: () => ({ card: 'generic', title: 'Done', content: [{ type: 'text', text: 'shown\ntoo' }] }) }
  const bare: Tool = { presentResult: () => ({ card: 'generic' }) }
  const { drawn } = await reading(
    [
      call(0, 'titled', '{}'),
      result(1, 'c0', 'hidden'),
      call(2, 'bare', '{}'),
      result(3, 'c2', 'its text'),
      call(4, 'none', '{}'),
      result(5, 'c4', 'raw\ntext'),
    ],
    { titled, bare },
  )
  assert.deepEqual((await drawn()).slice(0, 12), [
    '⏺ titled · 1.0s',
    '  ⎿ Done',
    '    shown',
    '    too',
    '',
    '⏺ bare · 1.0s',
    '  ⎿ its text',
    '',
    '⏺ none · 1.0s',
    '  ⎿ raw',
    '    text',
    '',
  ])
})

test("the result view's card chooses how the body is drawn, whatever the call view's was", async () => {
  const tool: Tool = {
    presentCall: () => ({ card: 'terminal', title: 'run', description: 'Runs it' }),
    presentResult: () => ({ card: 'read', path: 'a', offset: 1, lines: [], totalLines: 3 }),
  }
  const { drawn } = await reading([call(0, 'tool', '{}'), result(1, 'c0', '')], { tool })
  assert.deepEqual((await drawn()).slice(0, 2), ['⏺ run · 1.0s', '  ⎿ 0 lines of 3'])
})

test('while a call runs, its body draws what its call view says: a terminal its description and directory, a diff a line for each file, a generic its rawInput', async () => {
  const write: Tool = {
    presentCall: () => ({ card: 'diff', title: 'Write a.ts', diffs: [{ path: 'a.ts', oldText: null, newText: 'x\n' }] }),
  }
  const job: Tool = { presentCall: () => ({ card: 'generic', title: 'Job', rawInput: { id: 'j1', lines: ['a', 'b'] } }) }
  const { drawn } = await reading([call(0, 'bash', '{"command":"ls"}'), call(1, 'write', '{}'), call(2, 'job', '{}')], {
    bash: shell,
    write,
    job,
  })
  assert.deepEqual((await drawn()).slice(0, 9), [
    '⏺ ls',
    '  ⎿ List the files',
    '    /repo',
    '',
    '⏺ Write a.ts',
    '  ⎿ a.ts +1 -0',
    '',
    '⏺ Job',
    '  ⎿ {"id":"j1","lines":["a","b"]}',
  ])
})

test('a running call with no view draws its raw arguments as one line cut at the width, and one whose body has no line draws its first line alone with nothing to fold', async () => {
  const quiet: Tool = { presentCall: () => ({ card: 'generic', title: 'Quiet' }) }
  const { drawn, ctx, terminal } = await reading([call(0, 'read', '{"path":"a/very/long/path/to/a/file.ts"}'), call(1, 'quiet', '{}')], {
    quiet,
  })
  assert.deepEqual((await drawn()).slice(0, 5), ['⏺ read', '  ⎿ {"path":"a/very/long/path/to/a/file…', '', '⏺ Quiet', ''])
  terminal.type(clickAt(0, 3))
  await drawn()
  assert.deepEqual(stateOf(ctx).state?.folded, ['1'])
})

test('enter on a Marked card folds its body, its first line alone ending with (<n> lines), and again unfolds it', async () => {
  const { drawn, terminal, ctx } = await reading([call(0, 'ls', '{}'), result(1, 'c0', 'a\nb')])
  await drawn()
  terminal.type(ENTER)
  assert.deepEqual((await drawn()).slice(0, 2), ['⏺ ls · 1.0s (2 lines)', ''])
  assert.deepEqual(stateOf(ctx).state?.folded, ['0/body'])
  terminal.type(ENTER)
  assert.deepEqual((await drawn()).slice(0, 3), ['⏺ ls · 1.0s', '  ⎿ a', '    b'])
})

test("a click on a card's first line folds its body, and the Mark moves between cards as between events", async () => {
  const { drawn, terminal, ctx } = await reading([call(0, 'ls', '{}'), result(1, 'c0', 'a'), call(2, 'pwd', '{}'), result(3, 'c2', '/')])
  await drawn()
  terminal.type(clickAt(3, 0))
  assert.deepEqual((await drawn()).slice(0, 3), ['⏺ ls · 1.0s (1 line)', '', '⏺ pwd · 1.0s'])
  assert.equal(stateOf(ctx).state?.marked, 0)
  terminal.type(clickAt(3, 2))
  await drawn()
  terminal.type(UP)
  await drawn()
  assert.deepEqual([stateOf(ctx).state?.marked, await terminal.inverseAt(0, 0)], [0, true])
})

test('a result whose call is not in the session draws as the readable transcript draws it', async () => {
  const { drawn } = await reading([result(0, 'gone', 'orphan')])
  assert.deepEqual((await drawn()).slice(0, 2), ['⎿ orphan', ''])
})

test('an unknown tool, or a presenter that throws or gives none, draws the raw arguments while it runs, and its result from the result view all the same', async () => {
  const throws: Tool = {
    presentCall: () => {
      throw new Error('no')
    },
    presentResult: () => ({ card: 'read', path: 'a', offset: 1, lines: [], totalLines: 9 }),
  }
  const { drawn } = await reading(
    [call(0, 'throws', '{"a":1}'), result(1, 'c0', 'x'), call(2, 'throws', '{"b":2}'), call(3, 'unknown', '{"c":3}')],
    { throws },
  )
  assert.deepEqual((await drawn()).slice(0, 9), [
    '⏺ throws · 1.0s',
    '  ⎿ 0 lines of 9',
    '',
    '⏺ throws',
    '  ⎿ {"b":2}',
    '',
    '⏺ unknown',
    '  ⎿ {"c":3}',
    '',
  ])
})

test("arguments that are not JSON give neither view: the card draws the raw arguments while it runs, and the result's text once it came", async () => {
  const { drawn, asked } = await reading([call(0, 'bash', '{"command":'), call(1, 'bash', 'oops'), result(2, 'c1', 'its text')], {
    bash: shell,
  })
  assert.deepEqual((await drawn()).slice(0, 6), ['⏺ bash', '  ⎿ {"command":', '', '⏺ bash · 1.0s', '  ⎿ its text', ''])
  assert.deepEqual(asked, [])
})

test('a stored session draws its cards with the times they took, asks the tools service with no agent, and a call that never got a result draws no time', async () => {
  const { drawn, asked } = await reading(
    [call(0, 'bash', '{"command":"ls"}'), result(1, 'c0', '', { time: 2500, meta: { output: 'a' } }), call(2, 'bash', '{"command":"pwd"}')],
    { bash: shell },
  )
  assert.deepEqual((await drawn()).slice(0, 4), ['⏺ ls · 2.5s', '  ⎿ a', '', '⏺ pwd'])
  assert.deepEqual(new Set(asked.map(({ scope }) => scope)), new Set([undefined]))
})

test("a live session draws the same cards as a stored one, asking the tools service with the Chat's agent", async () => {
  const events = [call(0, 'bash', '{"command":"ls"}'), result(1, 'c0', '', { meta: { output: 'a' } })]
  const stored = await (await reading(events, { bash: shell }, 12)).drawn()
  const live = await talking({ bash: shell })
  for (const event of events) live.dsh.commit(live.ctx, event)
  assert.deepEqual(await live.drawn(), stored)
  assert.deepEqual(new Set(live.asked.map(({ scope }) => scope)), new Set([live.ctx.binnacleSession.agent]))
})

test('the call that streams draws through the view as ⏺ <tool>(<the arguments so far>), and the card takes its place once it commits', async () => {
  const { ctx, dsh, drawn } = await talking()
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, {
    type: 'chunk',
    attemptId: 'a1',
    revision: 1,
    index: 0,
    time: 1,
    chunk: { type: 'tool-call-delta', index: 0, id: 't', name: 'ls', argumentsDelta: '{"a' },
  })
  assert.deepEqual((await drawn()).slice(0, 1), ['⏺ ls({"a)'])
  dsh.commit(ctx, at(0, 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [] }, stream: [] }))
  dsh.commit(ctx, call(1, 'ls', '{"a":1}'))
  assert.deepEqual((await drawn()).slice(0, 2), ['⏺ ls', '  ⎿ {"a":1}'])
})

test('with the row binnacle-tool-cards off, a call and its result draw as two lines again', async () => {
  const { drawn, plugin } = await reading([call(0, 'ls', '{}'), result(1, 'c0', 'a.ts')])
  assert.deepEqual((await drawn()).slice(0, 3), ['⏺ ls · 1.0s', '  ⎿ a.ts', ''])
  await plugin.dispose()
  assert.deepEqual((await drawn()).slice(0, 3), ['⏺ ls({})', '⎿ a.ts', ''])
})

test('an author draws a card with transcript.card, given its data and { width, isFolded }, and frame from binnacle', async () => {
  const { drawn, ctx } = await reading(
    [call(0, 'bash', '{"command":"ls"}'), result(1, 'c0', 'a.ts', { time: 1500, meta: { output: 'a.ts', exitCode: 0 } })],
    { bash: shell },
  )
  const given: Card[] = []
  ctx.binnacle.look<CardLook>('transcript.card', () => (card, { width, isFolded }) => {
    given.push(card)
    return frame(ctx.binnacle, [`${card.name} ${JSON.stringify(card.args)} ${isFolded('0/body')}`], width, {
      title: card.call?.title ?? card.name,
    })
  })
  const rows = await drawn()
  assert.deepEqual(rows.slice(1, 2), ['│bash {"command":"ls"} false           │'])
  const card = given.at(-1)!
  assert.deepEqual(
    [card.seq, card.call?.card, card.result?.view?.card, card.result?.text, card.result?.failed, card.startedAt, card.endedAt],
    [0, 'terminal', 'terminal', 'a.ts', false, 0, 1500],
  )
})

test("an author changes a card's title, its time, one card kind's body or one tool's, each with its own Look", async () => {
  const { drawn, ctx } = await reading(
    [
      call(0, 'bash', '{"command":"ls"}'),
      result(1, 'c0', '', { meta: { output: 'a\nb\nc\nd', exitCode: 0 } }),
      call(2, 'grep', '{}'),
      result(3, 'c2', 'x'),
    ],
    { bash: shell },
  )
  ctx.binnacle.look<CardTitleLook>('transcript.card.title', (beneath) => (card, width) => `${beneath(card, width)}!`)
  ctx.binnacle.look<CardTimeLook>('transcript.card.time', () => () => '')
  ctx.binnacle.look<CardBodyLook>('transcript.card.terminal', (beneath) => (card, width) => beneath(card, width).slice(-3))
  ctx.binnacle.look<CardBodyLook>('transcript.tool.grep', () => () => ['found'])
  assert.deepEqual((await drawn()).slice(0, 8), ['⏺ ls!', '  ⎿ b', '    c', '    d', '', '⏺ grep!', '  ⎿ found', ''])
})

test("a view's text is Untrusted Text, which the default makes plain", async () => {
  const tool: Tool = {
    presentCall: () => ({ card: 'generic', title: 'a \x1b[31mred\x1b[0m title' }),
    presentResult: () => ({ card: 'generic', content: [{ type: 'text', text: '\x1b]0;x\x07ok' }] }),
  }
  const { drawn } = await reading([call(0, 'tool', '{}'), result(1, 'c0', '')], { tool })
  assert.deepEqual((await drawn()).slice(0, 2), ['⏺ a red title · 1.0s', '  ⎿ ok'])
})

test('an author counts a running time on a card with transcript.card.time and the model clock, and it changes each second', async () => {
  const { drawn, ctx, clock } = await reading([call(0, 'ls', '{}')])
  const now = ctx.binnacle.modelOf<{ now: number }>('clock')
  ctx.binnacle.look<CardTimeLook>(
    'transcript.card.time',
    (beneath) => (card) => (card.endedAt === undefined ? `${Math.floor(((now.state?.now ?? 0) - card.startedAt) / 1000)}s` : beneath(card)),
    { models: [now] },
  )
  assert.deepEqual((await drawn()).slice(0, 1), ['⏺ ls · 0s'])
  await clock.pass(2000)
  assert.deepEqual((await drawn()).slice(0, 1), ['⏺ ls · 2s'])
})

test('a running call with no view draws its raw arguments as the model wrote them, its digits and its quotes kept, while an author is given them parsed', async () => {
  const { drawn, ctx } = await reading([call(0, 'unknown', '{"n":9007199254740993}'), call(1, 'unknown', '"hello"')])
  const given: unknown[] = []
  ctx.binnacle.look<CardLook>('transcript.card', (beneath) => (card, where) => {
    given.push(card.args)
    return beneath(card, where)
  })
  assert.deepEqual((await drawn()).slice(0, 6), ['⏺ unknown', '  ⎿ {"n":9007199254740993}', '', '⏺ unknown', '  ⎿ "hello"', ''])
  assert.deepEqual(given.slice(-2), [{ n: 9007199254740992 }, 'hello'])
})

test("an author changes a card's dot with transcript.card.mark, which the default title draws before the title", async () => {
  const { drawn, ctx } = await reading([call(0, 'ls', '{}'), result(1, 'c0', 'a'), call(2, 'pwd', '{}')])
  const given: Card[] = []
  ctx.binnacle.look<CardMarkLook>('transcript.card.mark', (beneath) => (card) => {
    given.push(card)
    return card.result === undefined ? '…' : beneath(card)
  })
  assert.deepEqual((await drawn()).slice(0, 4), ['⏺ ls · 1.0s', '  ⎿ a', '', '… pwd'])
  assert.deepEqual(new Set(given.map(({ seq }) => seq)), new Set([0, 2]))
})

test('an author changes how many lines a body shows with transcript.card.most, and … n earlier lines counts what it leaves out', async () => {
  const output = Array.from({ length: 6 }, (_, line) => `line ${line + 1}`).join('\n')
  const { drawn, ctx } = await reading(
    [
      call(0, 'bash', '{"command":"seq"}'),
      result(1, 'c0', '', { meta: { output, exitCode: 0 } }),
      call(2, 'none', '{}'),
      result(3, 'c2', 'a\nb\nc'),
    ],
    { bash: shell },
  )
  ctx.binnacle.look<CardMostLook>('transcript.card.most', () => () => 2)
  assert.deepEqual((await drawn()).slice(0, 9), [
    '⏺ seq · 1.0s',
    '  ⎿ … 4 earlier lines',
    '    line 5',
    '    line 6',
    '',
    '⏺ none · 1.0s',
    '  ⎿ a',
    '    b',
    '',
  ])
})

test('a shell command that ends with an exit code other than 0, or with a signal, is a failed call, its ⏺ in the error Tone', async () => {
  const { drawn, ctx, terminal } = await reading(
    [
      call(0, 'bash', '{"command":"false"}'),
      result(1, 'c0', '', { meta: { output: 'no', exitCode: 1 } }),
      call(2, 'bash', '{"command":"sleep"}'),
      result(3, 'c2', '', { meta: { signal: 'SIGTERM' } }),
      call(4, 'bash', '{"command":"true"}'),
      result(5, 'c4', '', { meta: { output: 'ok', exitCode: 0 } }),
    ],
    { bash: shell },
    20,
  )
  const given = new Map<number, boolean | undefined>()
  ctx.binnacle.look<CardTitleLook>('transcript.card.title', (beneath) => (card, width) => {
    given.set(card.seq, card.result?.failed)
    return beneath(card, width)
  })
  const rows = await drawn()
  assert.deepEqual([rows[0], rows[4], rows[7]], ['⏺ false · 1.0s', '⏺ sleep · 1.0s', '⏺ true · 1.0s'])
  assert.deepEqual(await Promise.all([0, 4, 7].map((y) => terminal.colourAt(0, y))), [RED, RED, GREEN])
  assert.deepEqual([...given.entries()].toSorted(), [
    [0, true],
    [2, true],
    [4, false],
  ])
})
