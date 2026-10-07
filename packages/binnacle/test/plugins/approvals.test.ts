import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, scopeTarget } from '@deepseek-ai/dsh-scope'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import * as approvals from '../../src/plugins/approvals/index.ts'
import * as composer from '../../src/plugins/composer/index.ts'
import { agents } from '../support/agents.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'

async function chat(options: { columns?: number; rows?: number; provide?: (ctx: Context) => void; args?: string[] } = {}) {
  const dsh = agents()
  const mounted = await mount({
    args: options.args ?? [],
    columns: options.columns ?? 40,
    rows: options.rows ?? 10,
    provide: options.provide ?? dsh.provide,
  })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  const plugin = await mounted.ctx.plugin(approvals)
  // The session opens after the core loads; let it settle.
  await new Promise((resolve) => setImmediate(resolve))
  const rows = async (): Promise<string[]> => {
    await new Promise((resolve) => setImmediate(resolve))
    return (await mounted.terminal.read()).rows
  }
  const typed = async (...keys: string[]): Promise<string[]> => {
    for (const key of keys) mounted.terminal.type(key)
    return rows()
  }
  return { ...mounted, dsh, plugin, rows, typed }
}

interface Ask {
  agent?: object
  toolName?: string
  callId?: string
  reason?: string
  signal?: AbortSignal
}

// As dsh's ApprovalService dispatches it: through the agent's scope, with the fail-closed fallback.
const ask = (ctx: Context, dsh: ReturnType<typeof agents>, request: Ask = {}): Promise<ApprovalOutcome> => {
  const agent = request.agent ?? dsh.agent
  return ctx.waterfall(
    scopeTarget(agent, agent) as never,
    'approval/request',
    { ...request, agent, toolName: request.toolName ?? 'bash' } as never,
    () => Promise.resolve('unavailable' as ApprovalOutcome),
  ) as Promise<ApprovalOutcome>
}

const RULE = '─'.repeat(40)

test('enter picks the marked Choice, and the tool runs or is refused: "Allow once" is marked first', async () => {
  const { ctx, dsh, typed } = await chat()
  const outcome = ask(ctx, dsh)
  assert.equal(await (await typed('\r'), outcome), 'allowed-once')
})

test("up and down move the mark between the Choices, and from the last to the first, as pi-tui's lists do", async () => {
  const { ctx, dsh, typed } = await chat()
  const outcome = ask(ctx, dsh)
  assert.deepEqual((await typed('\x1b[A')).slice(-3), ['  Allow once', '› Reject', RULE])
  assert.deepEqual((await typed('\x1b[B')).slice(-3), ['› Allow once', '  Reject', RULE])
  assert.equal(await (await typed('\r'), outcome), 'allowed-once')
})

test('esc rejects, and while a Request is shown, esc does not interrupt the turn', async () => {
  const {
    ctx,
    dsh,
    dsh: { cancels },
    typed,
  } = await chat()
  const outcome = ask(ctx, dsh)
  await typed('\x1b')
  // A lone escape is told from the start of a sequence once nothing follows it.
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(await outcome, 'rejected')
  assert.deepEqual(cancels, [])
})

test('a click on a Choice picks it, and a click on another line of the Request does nothing', async () => {
  const { ctx, dsh, terminal, rows } = await chat()
  const outcome = ask(ctx, dsh)
  const shown = await rows()
  const rejectAt = shown.findIndex((row) => row === '  Reject')
  const titleAt = shown.findIndex((row) => row.includes('needs approval'))
  terminal.type(`\x1b[<0;1;${titleAt + 1}M`)
  assert.equal(await Promise.race([outcome, Promise.resolve('still pending')]), 'still pending')
  assert.equal(
    shown.findIndex((row) => row === '  Reject'),
    rejectAt,
  )
  terminal.type(`\x1b[<0;1;${rejectAt + 1}M`)
  assert.equal(await outcome, 'rejected')
})

test('once a Choice is picked, the Request goes, and the composer is back with its draft as it was', async () => {
  const { ctx, dsh, typed } = await chat()
  await typed('h', 'i')
  const outcome = ask(ctx, dsh)
  await typed('\r')
  assert.equal(await outcome, 'allowed-once')
  assert.deepEqual(await typed('!'), ['', '', '', '', '', '', '', RULE, 'hi! ', RULE])
})

test('when dsh withdraws a Request it is answered cancelled and goes, whether it is shown or waits in the queue, and the next Request is shown', async () => {
  const { ctx, dsh, rows } = await chat()
  const first = new AbortController()
  const second = new AbortController()
  const shown = ask(ctx, dsh, { toolName: 'bash', signal: first.signal })
  const waiting = ask(ctx, dsh, { toolName: 'cargo', signal: second.signal })
  assert.equal(
    (await rows()).some((row) => row.includes('cargo needs approval')),
    false,
  )
  second.abort()
  assert.equal(await waiting, 'cancelled')
  assert.equal(
    (await rows()).some((row) => row.includes('bash needs approval')),
    true,
  )
  first.abort()
  assert.equal(await shown, 'cancelled')
  assert.equal(
    (await rows()).some((row) => row.includes('needs approval')),
    false,
  )
})

test('a Request whose signal aborted before the waterfall dispatches it is answered cancelled, never shown, and does not block the next', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const withdrawn = new AbortController()
  withdrawn.abort()
  const gone = ask(ctx, dsh, { toolName: 'bash', signal: withdrawn.signal })
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
  assert.equal(await gone, 'cancelled')
  const next = ask(ctx, dsh, { toolName: 'cargo' })
  assert.equal(
    (await rows()).some((row) => row.includes('cargo needs approval')),
    true,
  )
  assert.equal(await (await typed('\r'), next), 'allowed-once')
})

test('a second Request waits until the first is answered, and Requests are shown in the order they came', async () => {
  const { ctx, dsh, rows, typed } = await chat()
  const first = ask(ctx, dsh, { toolName: 'bash' })
  const second = ask(ctx, dsh, { toolName: 'cargo' })
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('bash needs approval')), (await rows()).some((row) => row.includes('cargo needs approval'))],
    [true, false],
  )
  await typed('\r')
  assert.equal(await first, 'allowed-once')
  assert.deepEqual(
    [(await rows()).some((row) => row.includes('bash needs approval')), (await rows()).some((row) => row.includes('cargo needs approval'))],
    [false, true],
  )
  assert.equal(await Promise.race([second, Promise.resolve('still pending')]), 'still pending')
})

test('when the plugin unloads, each Request that still stands is answered unavailable, so the tool fails closed', async () => {
  const { ctx, dsh, plugin, rows } = await chat()
  const shown = ask(ctx, dsh, { toolName: 'bash' })
  const waiting = ask(ctx, dsh, { toolName: 'cargo' })
  await plugin.dispose()
  assert.deepEqual(await Promise.all([shown, waiting]), ['unavailable', 'unavailable'])
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
})

test("a Request for an agent under the Chat's names that agent's id in its title, and draws no arguments", async () => {
  const { ctx, dsh, rows } = await chat({ columns: 46, rows: 8 })
  const child = { id: 'session-child' }
  bindScopeParent(child, dsh.agent)
  const outcome = ask(ctx, dsh, { agent: child, callId: 'call-child' })
  assert.deepEqual(await rows(), [
    '',
    '',
    '',
    '',
    '── bash needs approval (session-child) ───────',
    '› Allow once',
    '  Reject',
    '─'.repeat(46),
  ])
  assert.equal(await Promise.race([outcome, Promise.resolve('still pending')]), 'still pending')
})

test("a Request for an agent that is not the Chat's and not under it is not answered, and the tool fails closed", async () => {
  const { ctx, dsh, rows } = await chat()
  const other = { id: 'session-other' }
  const outcome = ask(ctx, dsh, { agent: other })
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
  assert.equal(await outcome, 'unavailable')
})

test('on a stored session the plugin registers nothing, and a Request fails closed', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { ctx, dsh, rows } = await chat({
    provide: (context) => context.provide('sessionPersistence', store),
    args: ['--session', 'session-stored'],
  })
  const outcome = ask(ctx, dsh, { agent: { id: 'session-anyone' } })
  assert.deepEqual(await rows(), ['', '', '', '', '', '', '', RULE, ' ', RULE])
  assert.equal(await outcome, 'unavailable')
})

test("arguments that do not parse are drawn as they are, and at most 12 lines are drawn, then '… and N more lines'", async () => {
  const { ctx, dsh, rows, typed } = await chat({ rows: 21 })
  const raw = JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11, l: 12, m: 13, n: 14, o: 15 })
  dsh.commit(ctx, { seq: 1, type: 'tool/call', time: 0, data: { turn: 1, step: 1, callId: 'call-json', name: 'bash', arguments: raw } })
  dsh.commit(ctx, {
    seq: 2,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-raw', name: 'bash', arguments: 'not json {' },
  })
  const json = ask(ctx, dsh, { callId: 'call-json' })
  assert.deepEqual((await rows()).slice(4), [
    '── bash needs approval ─────────────────',
    '{',
    '  "a": 1,',
    '  "b": 2,',
    '  "c": 3,',
    '  "d": 4,',
    '  "e": 5,',
    '  "f": 6,',
    '  "g": 7,',
    '  "h": 8,',
    '  "i": 9,',
    '  "j": 10,',
    '  "k": 11,',
    '… and 5 more lines',
    '› Allow once',
    '  Reject',
    RULE,
  ])
  await typed('\r')
  assert.equal(await json, 'allowed-once')
  const shown = ask(ctx, dsh, { callId: 'call-raw' })
  assert.deepEqual((await rows()).slice(-5), ['── bash needs approval ─────────────────', 'not json {', '› Allow once', '  Reject', RULE])
  assert.equal(await Promise.race([shown, Promise.resolve('still pending')]), 'still pending')
})

test("with no callId, or with one that no event of the Chat's session carries, the Request draws no arguments", async () => {
  const { ctx, dsh, rows } = await chat()
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"cargo publish"}' },
  })
  ask(ctx, dsh, { callId: 'call-none' })
  assert.deepEqual((await rows()).slice(6), ['── bash needs approval ─────────────────', '› Allow once', '  Reject', RULE])
})

test('a Request with no callId draws no arguments either', async () => {
  const { ctx, dsh, rows } = await chat()
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"cargo publish"}' },
  })
  ask(ctx, dsh)
  assert.deepEqual((await rows()).slice(6), ['── bash needs approval ─────────────────', '› Allow once', '  Reject', RULE])
})

test('every other key does nothing while a Request is shown: it neither types, interrupts, clears nor quits', async () => {
  const { ctx, dsh, typed, exits } = await chat()
  ask(ctx, dsh)
  const rows = await typed('x', '\x03', '\x03')
  assert.deepEqual([rows.slice(-3), exits, dsh.cancels], [['› Allow once', '  Reject', RULE], [], []])
})

test("when the agent asks to run a tool that needs an approval, a Request takes the composer's Place: the tool's name, why it asks, the call's arguments, and the two Choices", async () => {
  const { ctx, dsh, rows } = await chat()
  dsh.commit(ctx, {
    seq: 1,
    type: 'tool/call',
    time: 0,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"cargo publish"}' },
  })
  const outcome = ask(ctx, dsh, { callId: 'call-1', reason: 'It will run outside the sandbox.' })
  assert.deepEqual(await rows(), [
    '',
    '',
    '── bash needs approval ─────────────────',
    'It will run outside the sandbox.',
    '{',
    '  "command": "cargo publish"',
    '}',
    '› Allow once',
    '  Reject',
    RULE,
  ])
  assert.equal(await Promise.race([outcome, Promise.resolve('still pending')]), 'still pending')
})
