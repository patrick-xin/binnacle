import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { TranscriptState } from '../../src/plugins/transcript/index.ts'
import { callOf, textOf } from '../../src/plugins/transcript/index.ts'
import type { CallLook, NoticeLook, TextLook } from '../../src/plugins/transcript-view/index.ts'
import { wrap } from '../../src/index.ts'
import { mounted } from '../support/mounted.ts'

const ENTER = '\r'
const UP = '\x1b[A'
const DOWN = '\x1b[B'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`
const CYAN = 6
const BRIGHT_BLACK = 8
const YELLOW = 3
const RED = 1

type Event = { seq: number; type: string; time: number; data: unknown }

const at = (seq: number, type: string, data: unknown): Event => ({ seq, type, time: seq + 1, data })
const prompt = (seq: number, text: string) =>
  at(seq, 'user/message', { role: 'user', source: { kind: 'user' }, content: text === '' ? [] : [{ type: 'text', text }] })
const context = (seq: number, kind: string) =>
  at(seq, 'user/message', { role: 'user', source: { kind }, content: [{ type: 'text', text: 'the rules of the workspace' }] })
const answer = (seq: number, content: object[]) =>
  at(seq, 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content }, stream: [] })
const call = (seq: number, name: string, args: string) =>
  at(seq, 'tool/call', { turn: 1, step: 1, callId: `c${seq}`, name, arguments: args })
const result = (seq: number, text: string, isError = false) =>
  at(seq, 'tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'tool', toolCallId: 'c', isError, content: text === '' ? [] : [{ type: 'text', text }] },
  })

const BUILT_INS = ['binnacle-transcript', 'binnacle-transcript-view']

async function reading(events: readonly Event[], rows = 12, columns = 40) {
  const mount = await mounted({ size: { columns, rows }, builtins: BUILT_INS, stored: { id: 'session-stored', events: events as never } })
  const drawn = async () => (await mount.terminal.read()).rows
  return { ...mount, plugin: mount.row('binnacle-transcript-view'), drawn }
}

async function talking(rows = 12) {
  const mount = await mounted({ size: { columns: 40, rows }, builtins: BUILT_INS })
  return { ...mount, drawn: async () => (await mount.terminal.read()).rows }
}

const stateOf = (ctx: Context) => ctx.binnacle.modelOf<TranscriptState>('transcript')
const start = { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 }
const chunk = (index: number, streamed: object) => ({ type: 'chunk', attemptId: 'a1', revision: 1, index, time: 1, chunk: streamed })

test('a prompt draws as › and its text in the accent Tone, and the lines it wraps to start under its text', async () => {
  const { drawn, terminal } = await reading([prompt(0, 'please fix the bug in the parser of the config')])
  assert.deepEqual((await drawn()).slice(0, 3), ['› please fix the bug in the parser of', '  the config', ''])
  assert.deepEqual([await terminal.colourAt(0, 0), await terminal.colourAt(2, 1)], [CYAN, CYAN])
})

test('a prompt with no text draws › alone', async () => {
  const { drawn } = await reading([prompt(0, '')])
  assert.deepEqual((await drawn()).slice(0, 2), ['› ', ''])
})

test('an answer draws its reasoning in the dim Tone, then its text, then a blank line', async () => {
  const { drawn, terminal } = await reading([
    answer(0, [
      { type: 'text', text: 'It is fixed.' },
      { type: 'reasoning', text: 'The parser drops a quote.' },
    ]),
  ])
  assert.deepEqual((await drawn()).slice(0, 4), ['The parser drops a quote.', 'It is fixed.', '', ''])
  const style = async (y: number) => (await terminal.styleAt(1, y)).dim
  assert.deepEqual([await style(0), await style(1)], [true, false])
})

test("an answer's text draws as markdown, wrapped at the width, and a list item's lines that wrap start under its text", async () => {
  const { drawn, terminal } = await reading(
    [answer(0, [{ type: 'text', text: '## Fixed\nThe **parser** drops a `quote`.\n\n- one two three four five\n- six' }])],
    9,
    20,
  )
  assert.deepEqual((await drawn()).slice(0, 8), [
    'Fixed',
    '',
    'The parser drops a',
    'quote.',
    '',
    '• one two three four',
    '  five',
    '• six',
  ])
  const styles = await Promise.all([terminal.styleAt(0, 0), terminal.styleAt(4, 2), terminal.styleAt(0, 3)])
  assert.deepEqual(
    styles.map(({ colour, bold }) => [colour, bold]),
    [
      [CYAN, true],
      ['default', true],
      [YELLOW, false],
    ],
  )
})

test('an answer with no text and no reasoning, such as one that only calls tools, draws nothing and takes no row', async () => {
  const { drawn } = await reading([
    prompt(0, 'hi'),
    answer(1, [{ type: 'tool-call', id: 'c', name: 'ls', arguments: '{}' }]),
    call(2, 'ls', '{}'),
  ])
  assert.deepEqual((await drawn()).slice(0, 3), ['› hi', '', '⏺ ls({})'])
})

test('a tool call draws as one line, ⏺ <tool>(<its arguments>), cut at the width', async () => {
  const { drawn } = await reading([call(0, 'read', '{"path":"a/very/long/path/to/a/file.ts"}'), call(1, 'ls', '{}')])
  assert.deepEqual((await drawn()).slice(0, 3), ['⏺ read({"path":"a/very/long/path/to/a/f…', '⏺ ls({})', ''])
})

test('a tool result draws as one line, ⎿ and its first line of text cut at the width, then a blank line', async () => {
  const { drawn } = await reading([
    call(0, 'read', '{}'),
    result(1, 'line one of a long result that goes on and on\nline two'),
    call(2, 'ls', '{}'),
    result(3, ''),
  ])
  assert.deepEqual((await drawn()).slice(0, 7), [
    '⏺ read({})',
    '⎿ line one of a long result that goes o…',
    '',
    '⏺ ls({})',
    '⎿ (no text)',
    '',
    '',
  ])
})

test('a tool result that failed draws as ✗ and its first line in the error Tone, or ✗ failed with no text', async () => {
  const { drawn, terminal } = await reading([result(0, 'no such file\nat read', true), result(1, '', true)])
  assert.deepEqual((await drawn()).slice(0, 4), ['✗ no such file', '', '✗ failed', ''])
  assert.deepEqual([await terminal.colourAt(0, 0), await terminal.colourAt(2, 2)], [RED, RED])
})

test('context the person did not type draws as one line in the dim Tone that names its producer', async () => {
  const { drawn, terminal } = await reading([context(0, 'agent-instructions'), prompt(1, 'hi')])
  assert.deepEqual((await drawn()).slice(0, 3), ['· context: agent-instructions', '› hi', ''])
  assert.equal((await terminal.styleAt(4, 0)).dim, true)
})

test('a command, a retry, a compaction and how a turn ended draw one line each', async () => {
  const { drawn, terminal } = await reading([
    at(0, 'command/run', { commandId: 'k', name: 'compact', source: {} }),
    at(1, 'compaction/end', { compactionId: 'p', turn: null }),
    at(2, 'llm/retry', { retry: 1, maxRetries: 3, failure: { message: 'overloaded', code: 'X' } }),
    at(3, 'turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'the key is wrong', code: 'X' } } }),
    at(4, 'turn/end', { turn: 2, reason: { kind: 'aborted', reason: {} } }),
  ])
  assert.deepEqual((await drawn()).slice(0, 6), [
    '/compact',
    '· context compacted',
    'retrying (1/3): overloaded',
    '✗ the key is wrong',
    '· interrupted',
    '',
  ])
  const colours = await Promise.all([1, 2, 3, 4].map((y) => terminal.colourAt(2, y)))
  assert.deepEqual(colours, [BRIGHT_BLACK, YELLOW, RED, BRIGHT_BLACK])
})

test("a notice's text that is long or has more than one line draws one line, cut at the width", async () => {
  const { drawn } = await reading(
    [
      at(0, 'llm/retry', {
        retry: 1,
        maxRetries: 3,
        failure: { message: 'the server is overloaded and cannot accept this request now', code: 'X' },
      }),
      at(1, 'command/done', { commandId: 'k', kind: 'error', text: 'no such\nmodel' }),
    ],
    4,
    20,
  )
  assert.deepEqual(await drawn(), ['retrying (1/3): the…', '✗ no such model', '', ''])
})

test('every other event draws nothing and takes no row, and the Mark passes over it', async () => {
  const { drawn, ctx, terminal } = await reading([
    prompt(0, 'hi'),
    at(1, 'step/start', { turn: 1, step: 1 }),
    at(2, 'request/header', {}),
    at(3, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    call(4, 'ls', '{}'),
    at(5, 'step/end', { turn: 1, step: 1 }),
  ])
  assert.deepEqual((await drawn()).slice(0, 4), ['› hi', '', '⏺ ls({})', ''])
  assert.equal(await terminal.inverseAt(0, 2), true)
  terminal.type(UP)
  await drawn()
  assert.deepEqual([await terminal.inverseAt(0, 0), stateOf(ctx).state?.marked], [true, 0])
  terminal.type(DOWN)
  await drawn()
  assert.deepEqual([await terminal.inverseAt(0, 2), stateOf(ctx).state?.marked], [true, 4])
})

test('a folded event with more than one line draws its first line, then … <n> more lines in the muted Tone, and one of one line draws as it was', async () => {
  const { drawn, ctx, terminal } = await reading([
    answer(0, [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'one\ntwo' },
    ]),
    call(1, 'ls', '{}'),
  ])
  stateOf(ctx).set((state) => state.folded.push('0', '1'))
  assert.deepEqual((await drawn()).slice(0, 4), ['think', '… 2 more lines', '', '⏺ ls({})'])
  assert.equal(await terminal.colourAt(0, 1), BRIGHT_BLACK)
  terminal.type(ENTER)
  terminal.type(UP)
  terminal.type(ENTER)
  assert.deepEqual((await drawn()).slice(0, 6), ['think', 'one', 'two', '', '⏺ ls({})', ''])
})

test("a click on the first line of an event that the view draws folds it, as the view's first lines are plain strings, and a click on its next line folds nothing", async () => {
  const { drawn, ctx, terminal } = await reading([answer(0, [{ type: 'text', text: 'one\ntwo' }]), call(1, 'ls', '{}')])
  await drawn()
  terminal.type(clickAt(0, 1))
  await drawn()
  assert.deepEqual(stateOf(ctx).state?.folded, [])
  terminal.type(clickAt(0, 0))
  assert.deepEqual((await drawn()).slice(0, 3), ['one', '… 1 more lines', ''])
})

test('a click on a prompt folds nothing, and a prompt Marked draws whole at enter', async () => {
  const { drawn, ctx, terminal } = await reading([prompt(0, 'one\ntwo')])
  await drawn()
  terminal.type(clickAt(2, 0))
  const clicked = [(await drawn()).slice(0, 3), [...(stateOf(ctx).state?.folded ?? [])]]
  terminal.type(ENTER)
  const entered = (await drawn()).slice(0, 3)
  assert.deepEqual(
    [clicked, entered],
    [
      [['› one', '  two', ''], []],
      ['› one', '  two', ''],
    ],
  )
})

test('a click on an event of one line folds nothing', async () => {
  const { drawn, ctx, terminal } = await reading([answer(0, [{ type: 'text', text: 'done' }]), context(1, 'instructions')])
  await drawn()
  terminal.type(clickAt(0, 0))
  terminal.type(clickAt(0, 2))
  await drawn()
  assert.deepEqual(stateOf(ctx).state?.folded, [])
})

test('the answer that streams draws its reasoning, its text, a blank line, then each tool call with the arguments so far', async () => {
  const { ctx, dsh, drawn, terminal } = await talking()
  dsh.commit(ctx, prompt(0, 'hi'))
  dsh.stream(ctx, start)
  dsh.stream(ctx, chunk(0, { type: 'tool-call-delta', index: 2, id: 't1', name: 'read', argumentsDelta: '{"pa' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 1, text: 'Let me look.' }))
  dsh.stream(ctx, chunk(2, { type: 'reasoning-delta', index: 0, text: 'hm' }))
  assert.deepEqual((await drawn()).slice(0, 6), ['› hi', '', 'hm', 'Let me look.', '', '⏺ read({"pa)'])
  assert.equal((await terminal.styleAt(0, 2)).dim, true)
})

test('the answer that streams draws its text as markdown, and an unclosed code block as code to the end', async () => {
  const { ctx, dsh, drawn, terminal } = await talking()
  dsh.stream(ctx, start)
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: '**Run:**\n\n```sh\nls -la\n# all' }))
  assert.deepEqual((await drawn()).slice(0, 5), ['Run:', '', '  ls -la', '  # all', ''])
  assert.deepEqual([(await terminal.styleAt(0, 0)).bold, await terminal.colourAt(2, 3)], [true, YELLOW])
})

test('the answer that streams draws the rows it draws once it commits and its calls come in', async () => {
  const { ctx, dsh, drawn } = await talking()
  dsh.stream(ctx, start)
  dsh.stream(ctx, chunk(0, { type: 'reasoning-delta', index: 0, text: 'hm' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 1, text: 'Let me look.' }))
  dsh.stream(ctx, chunk(2, { type: 'tool-call-delta', index: 2, id: 't1', name: 'ls', argumentsDelta: '{}' }))
  const streaming = await drawn()
  dsh.commit(
    ctx,
    answer(0, [
      { type: 'reasoning', text: 'hm' },
      { type: 'text', text: 'Let me look.' },
      { type: 'tool-call', id: 't1', name: 'ls', arguments: '{}' },
    ]),
  )
  dsh.commit(ctx, call(1, 'ls', '{}'))
  assert.deepEqual(await drawn(), streaming)
})

test('a stored session draws the same way as one that commits', async () => {
  const events = [prompt(0, 'hi'), answer(1, [{ type: 'text', text: 'Hello.' }]), call(2, 'ls', '{}'), result(3, 'a.ts')]
  const stored = await (await reading(events)).drawn()
  const live = await talking()
  for (const event of events) live.dsh.commit(live.ctx, event)
  assert.deepEqual(await live.drawn(), stored)
  assert.deepEqual(stored.slice(0, 7), ['› hi', '', 'Hello.', '', '⏺ ls({})', '⎿ a.ts', ''])
})

test('with the row binnacle-transcript-view off, the transcript draws every event raw again', async () => {
  const { drawn, plugin } = await reading([at(0, 'turn/start', { turn: 1 })], 4)
  assert.deepEqual(await drawn(), ['', '', '', ''])
  await plugin.dispose()
  assert.deepEqual(await drawn(), ['▾ #0 turn/start', '{', '  "turn": 1', '}'])
})

test('an author changes the prompts with the Look transcript.prompt, given plain data and the width, and wraps them with wrap', async () => {
  const { drawn, ctx } = await reading([prompt(0, 'one two three four'), answer(1, [{ type: 'text', text: 'ok' }])], 6, 10)
  ctx.binnacle.look<TextLook>(
    'transcript.prompt',
    () =>
      (text, { width }) =>
        wrap(text, width, { first: '> ', rest: '| ' }),
  )
  assert.deepEqual((await drawn()).slice(0, 5), ['> one two', '| three', '| four', '', 'ok'])
})

test("each piece's Look is given its event's time, so a prompt draws with the time it was sent in a Look of transcript.prompt alone", async () => {
  const sent = Date.UTC(2026, 9, 10, 9, 5)
  const { drawn, ctx } = await reading([
    { ...prompt(0, 'hi'), time: sent },
    { ...call(1, 'ls', '{}'), time: sent + 1000 },
  ])
  ctx.binnacle.look<TextLook>('transcript.prompt', () => (text, { time }) => [`${new Date(time ?? 0).toISOString().slice(11, 16)} ${text}`])
  ctx.binnacle.look<CallLook>('transcript.call', () => ({ name }, { time }) => [`${name} at ${time}`])
  assert.deepEqual((await drawn()).slice(0, 3), ['09:05 hi', '', `ls at ${sent + 1000}`])
})

test('a piece of the answer that streams is given no time, as it is no event yet', async () => {
  const { ctx, dsh, drawn } = await talking()
  ctx.binnacle.look<TextLook>('transcript.answer', () => (text, { time }) => [`${text} at ${time}`])
  ctx.binnacle.look<CallLook>('transcript.call', () => ({ name }, { time }) => [`${name} at ${time}`])
  dsh.stream(ctx, start)
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: 'Let me look.' }))
  dsh.stream(ctx, chunk(1, { type: 'tool-call-delta', index: 1, id: 't1', name: 'ls', argumentsDelta: '{}' }))
  assert.deepEqual((await drawn()).slice(0, 3), ['Let me look. at undefined', '', 'ls at undefined'])
})

test('with the view on, transcript.reasoning alone hides the reasoning, committed and streaming', async () => {
  const { ctx, dsh, drawn } = await talking()
  ctx.binnacle.look<TextLook>('transcript.reasoning', () => () => [])
  dsh.commit(
    ctx,
    answer(0, [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'Done.' },
    ]),
  )
  dsh.stream(ctx, start)
  dsh.stream(ctx, chunk(0, { type: 'reasoning-delta', index: 0, text: 'hm' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 1, text: 'Next.' }))
  assert.deepEqual((await drawn()).slice(0, 5), ['Done.', '', 'Next.', '', ''])
})

test('each piece is a Look of its own, which an author changes alone', async () => {
  const { drawn, ctx } = await reading([
    context(0, 'skill'),
    answer(1, [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'Done.' },
    ]),
    call(2, 'ls', '{}'),
    result(3, 'a.ts'),
    at(4, 'turn/end', { turn: 1, reason: { kind: 'max-tokens' } }),
  ])
  ctx.binnacle.look<TextLook>('transcript.reasoning', () => (text) => [text.toUpperCase()])
  ctx.binnacle.look<TextLook>('transcript.answer', () => (text) => [`= ${text}`])
  ctx.binnacle.look<CallLook>('transcript.call', () => ({ name, args }) => [`${name} ${args}`])
  ctx.binnacle.look('transcript.result', () => ({ text, failed }: { text: string; failed: boolean }) => [`${failed ? 'x' : 'v'} ${text}`])
  ctx.binnacle.look('transcript.context', () => ({ producer }: { producer: string }) => [`[${producer}]`])
  ctx.binnacle.look<NoticeLook>('transcript.notice', () => ({ kind, text, severity }) => [`${kind}/${severity}: ${text}`])
  assert.deepEqual((await drawn()).slice(0, 9), [
    '[skill]',
    'THINK',
    '= Done.',
    '',
    'ls {}',
    'v a.ts',
    '',
    'turn/warning: stopped at the output',
    'limit',
  ])
})

test('a piece is given its text as it came, Untrusted Text, and the default makes it plain', async () => {
  const { drawn, ctx, terminal } = await reading([prompt(0, 'a \x1b[31mred\x1b[0m word')], 4)
  const given: string[] = []
  ctx.binnacle.look<TextLook>('transcript.prompt', (beneath) => (text, where) => {
    given.push(text)
    return beneath(text, where)
  })
  assert.deepEqual((await drawn()).slice(0, 1), ['› a red word'])
  assert.deepEqual([given.at(-1), await terminal.colourAt(4, 0)], ['a \x1b[31mred\x1b[0m word', CYAN])
})

test('a piece whose Look draws nothing is taken out, and an event left with no line takes no row, its blank line included', async () => {
  const { drawn, ctx } = await reading([
    prompt(0, 'hi'),
    answer(1, [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'Done.' },
    ]),
    answer(2, [{ type: 'reasoning', text: 'more' }]),
    call(3, 'ls', '{}'),
  ])
  ctx.binnacle.look<TextLook>('transcript.reasoning', () => () => [])
  assert.deepEqual((await drawn()).slice(0, 6), ['› hi', '', 'Done.', '', '⏺ ls({})', ''])
})

test('the readers give each piece its data from an event, so an author draws an event of their own from them', async () => {
  const { drawn, ctx } = await reading([call(0, 'ls', '{}'), result(1, 'a.ts')])
  ctx.binnacle.look('transcript.event.tool/result', () => (event: Parameters<typeof textOf>[0]) => [`-> ${textOf(event)}`])
  ctx.binnacle.look('transcript.event.tool/call', () => (event: Parameters<typeof callOf>[0]) => [`${callOf(event)?.name}!`])
  assert.deepEqual((await drawn()).slice(0, 3), ['ls!', '-> a.ts', ''])
})
