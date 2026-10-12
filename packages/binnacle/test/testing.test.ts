import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { internals } from '../src/index.ts'
import { mount } from '../src/testing/index.ts'
import type { Mounted } from '../src/testing/index.ts'
import type { ClockState, TurnState } from '../src/api.ts'
import type { SegmentLook } from '../src/plugins/status-line/index.ts'

let mounted: Mounted | undefined
afterEach(async () => {
  await mounted?.close()
  mounted = undefined
})

const hint = {
  name: 'hint',
  inject: ['binnacle'],
  apply: (ctx: Context) => {
    ctx.binnacle.look('composer.empty', () => () => 'Ask anything')
  },
}

const RULE = '─'.repeat(30)

test("`mount` starts binnacle with the built-ins and an author's plugin over them: the screen is its rows, and a key and text reach it as a terminal sends them", async () => {
  mounted = await mount({ size: { columns: 30, rows: 5 }, plugins: [hint] })
  const empty = await mounted.screen()
  await mounted.type('hi')
  const typed = await mounted.screen()
  const cursor = await mounted.cursor()
  await mounted.press('enter')
  assert.deepEqual(
    [empty, typed, cursor, mounted.agent.sent],
    [
      ['', 'idle · deepseek-v4', RULE, ' Ask anything', RULE],
      ['', 'idle · deepseek-v4', RULE, 'hi ', RULE],
      { x: 2, y: 3 },
      [{ how: 'followup', text: 'hi' }],
    ],
  )
})

test('`mount` drives dsh as a session does: the agent runs, its answer streams and is committed, and the fake clock moves', async () => {
  mounted = await mount({ size: { columns: 30, rows: 6 } })
  await mounted.agent.status('running')
  await mounted.agent.stream({ type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 } as never)
  await mounted.agent.stream({
    type: 'chunk',
    attemptId: 'a1',
    revision: 1,
    index: 0,
    time: 1,
    chunk: { type: 'text-delta', index: 0, text: 'Hel' },
  } as never)
  const streaming = await mounted.screen()
  await mounted.agent.commit({
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] }, stream: [] },
  })
  await mounted.agent.status('idle')
  const before = mounted.clock.now
  await mounted.clock.pass(1500)
  assert.deepEqual(
    [streaming.slice(0, 2), (await mounted.screen()).slice(0, 2), mounted.clock.now - before],
    [['Hel', ''], ['Hello', ''], 1500],
  )
})

test('a question that a tool asks is answered with keys, and an approval of a call with its reason, as a subagent asks too', async () => {
  mounted = await mount({ size: { columns: 40, rows: 12 } })
  const asked = mounted.ask([{ id: 'q1', question: 'Which?', options: [{ label: 'One' }, { label: 'Two' }] }])
  const question = await mounted.screen()
  await mounted.press('down')
  await mounted.press('enter')
  const child = mounted.agent.child('session-child')
  const approved = mounted.approve('bash', { reason: 'It runs outside the sandbox.', agent: child })
  const approval = await mounted.screen()
  await mounted.press('enter')
  assert.deepEqual(
    [question.includes('› One'), await asked, approval.some((row) => row.includes('bash needs approval (session-child)')), await approved],
    [true, { answers: [{ id: 'q1', selected: ['Two'] }] }, true, 'allowed-once'],
  )
})

test("a Request settles when its signal aborts, as dsh's own does, and escape interrupts the turn", async () => {
  mounted = await mount({ size: { columns: 40, rows: 12 } })
  const aborts = new AbortController()
  const asked = mounted.approve('bash', { signal: aborts.signal })
  aborts.abort()
  await mounted.agent.status('running')
  await mounted.press('escape')
  assert.deepEqual([await asked, mounted.agent.cancels], ['cancelled', [{ cause: { kind: 'user' }, options: { keepInbox: true } }]])
})

test('`mount` opens a stored session read only, and a row unloads while the mount stays open', async () => {
  mounted = await mount({
    size: { columns: 30, rows: 4 },
    builtins: ['binnacle-transcript', 'binnacle-transcript-view', 'binnacle-status-line'],
    stored: {
      id: 'session-old',
      events: [
        {
          seq: 1,
          type: 'user/message',
          time: 0,
          data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] },
        },
      ] as never,
    },
  })
  const stored = await mounted.screen()
  await mounted.unload('binnacle-status-line')
  assert.deepEqual(
    [stored, await mounted.screen()],
    [
      ['› hi', '', '', 'read only · session-old'],
      ['› hi', '', '', ''],
    ],
  )
})

test('`mount` refuses a second mount while one is open, a closed mount refuses its calls, and after `close` the next mounts afresh', async () => {
  const first = await mount({ size: { columns: 30, rows: 4 }, builtins: [] })
  mounted = first
  const refused = await mount().then(
    () => 'mounted',
    (error: Error) => error.message,
  )
  await first.close()
  const read = await first.screen().then(
    () => 'read',
    (error: Error) => error.message,
  )
  mounted = await mount({ size: { columns: 30, rows: 4 }, builtins: ['binnacle-status-line'] })
  assert.deepEqual(
    [refused, read, (await mounted.screen()).at(-1)],
    ['binnacle/testing: a mount is open; close it before another', 'binnacle/testing: this mount is closed', 'idle · deepseek-v4'],
  )
})

test('a click reaches the cell clicked, and a key by a name that is not known is refused', async () => {
  mounted = await mount({ size: { columns: 30, rows: 4 }, builtins: [] })
  const clicked: string[] = []
  mounted.binnacle.place('transcript', { lines: () => ['a', 'b'], click: (at) => clicked.push(`${at.line}:${at.column}`) > 0 })
  await mounted.click(0, 1)
  const unknown = await mounted.press('hyper+x').then(
    () => 'pressed',
    (error: Error) => error.message,
  )
  assert.deepEqual([clicked, unknown], [['1:0'], 'binnacle/testing: no key is named hyper+x'])
})

test("the wheel scrolls the Place under it, a cell's style is read, and the terminal resizes", async () => {
  mounted = await mount({ size: { columns: 30, rows: 3 }, builtins: [] })
  const binnacle = mounted.binnacle
  binnacle.layout('chat', { column: [{ place: 'transcript' }] })
  binnacle.place('transcript', {
    lines: () => ['one', 'two', binnacle.paint({ bold: true }, 'three'), 'four'],
  })
  const end = await mounted.screen()
  const bold = await mounted.style(0, 1)
  await mounted.wheel(0, 0, 1)
  const scrolled = await mounted.screen()
  await mounted.resize(30, 4)
  assert.deepEqual(
    [end, bold.bold, scrolled, await mounted.screen()],
    [['two', 'three', 'four'], true, ['one', 'two', 'three'], ['one', 'two', 'three', 'four']],
  )
})

// AUTHORING.md's plugin of the turn, as its test of a plugin loads it.
const elapsed = {
  name: 'elapsed',
  inject: ['binnacle'],
  apply: (ctx: Context) => {
    const turn = ctx.binnacle.modelOf<TurnState>('turn')
    const clock = ctx.binnacle.modelOf<ClockState>('clock')
    ctx.binnacle.look<SegmentLook>(
      'status.state',
      (beneath) => (value) => {
        const startedAt = turn.state?.startedAt
        if (startedAt === undefined) return beneath(value)
        const seconds = Math.max(0, Math.floor(((clock.state?.now ?? startedAt) - startedAt) / 1000))
        return `${beneath(value)} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      },
      { models: [turn, clock] },
    )
  },
}

test("AUTHORING.md's test of a plugin mounts it over the built-ins, drives a turn, and reads the rows", async () => {
  const app = await mount({ size: { columns: 30, rows: 5 }, plugins: [elapsed] })
  mounted = app
  await app.agent.status('running')
  await app.agent.commit({ type: 'turn/start', data: { turn: 1 } })
  await app.clock.pass(65_000)
  assert.equal((await app.screen())[1], 'running 1:05 · deepseek-v4')
})

test("a service that a test provides replaces the mount's own fake by its name, so an `agents` that never makes one keeps the session from opening", async () => {
  mounted = await mount({
    size: { columns: 30, rows: 5 },
    provide: (ctx) => ctx.provide('agents' as never, { create: () => new Promise(() => {}) } as never),
  })
  await mounted.type('hi')
  await mounted.press('enter')
  assert.deepEqual([(await mounted.screen()).slice(1), mounted.agent.sent], [['', RULE, 'hi ', RULE], []])
})

test('a mount that fails part of the way gives back what it replaced, so the next mounts afresh', async () => {
  const now = internals.now
  const failed = await mount({
    provide: () => {
      throw new Error('provider failed')
    },
  }).then(
    () => 'mounted',
    (error: Error) => error.message,
  )
  const replacedAfter = internals.now !== now
  const unknown = await mount({ builtins: ['binnacle-nothing'] }).then(
    () => 'mounted',
    (error: Error) => error.message,
  )
  mounted = await mount({ size: { columns: 30, rows: 4 }, builtins: ['binnacle-status-line'] })
  assert.deepEqual(
    [failed, replacedAfter, unknown, (await mounted.screen()).at(-1)],
    ['provider failed', false, 'binnacle/testing: no built-in row is named binnacle-nothing', 'idle · deepseek-v4'],
  )
})

test('a closed mount refuses every call, and its clock does not move', async () => {
  const app = await mount({ builtins: [] })
  await app.close()
  const refusals = await Promise.all(
    [
      () => app.screen(),
      () => app.style(0, 0),
      () => app.cursor(),
      () => app.press('enter'),
      () => app.type('x'),
      () => app.click(0, 0),
      () => app.wheel(0, 0, 1),
      () => app.resize(10, 10),
      () => app.agent.status('running'),
      () => app.agent.commit({ type: 'turn/start', data: {} }),
      () => app.agent.stream({} as never),
      async () => app.agent.child('late'),
      () => app.ask([{ id: 'q', question: 'Q?' }]),
      () => app.approve('bash'),
      () => app.clock.pass(100),
      () => app.unload('binnacle'),
    ].map((call) =>
      call().then(
        () => 'ran',
        (error: Error) => error.message,
      ),
    ),
  )
  assert.deepEqual([new Set(refusals), app.clock.now], [new Set(['binnacle/testing: this mount is closed']), 0])
})
