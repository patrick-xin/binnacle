import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as transcript from '../../src/plugins/transcript/index.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'
import { agents } from '../support/agents.ts'
import type { Stored } from '../support/sessions.ts'

const settled = () => new Promise((resolve) => setImmediate(resolve))

const SHIFT_TAB = '\x1b[Z'
const UP = '\x1b[A'
const DOWN = '\x1b[B'
const ENTER = '\r'
const clickAt = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`

/** A Place that takes keys, so the Focus can move to it and away from the transcript. */
const probe = (name: string, place: (ctx: Context) => void) => ({ name, inject: ['binnacle'] as const, apply: place })
const composerTakingKeys = (ctx: Context) => {
  ctx.binnacle.place('composer', { lines: () => [''], key: () => false })
}

const stored: Stored = {
  id: 'session-stored',
  createdAt: 1,
  events: [
    { seq: 0, type: 'user/message', time: 2, data: { text: 'hello' } },
    { seq: 1, type: 'test/marker', time: 3, data: {} },
  ],
}

const three: Stored = {
  id: 'session-stored',
  createdAt: 1,
  events: [
    { seq: 0, type: 'test/one', time: 2, data: {} },
    { seq: 1, type: 'test/two', time: 3, data: {} },
    { seq: 2, type: 'test/three', time: 4, data: {} },
  ],
}

async function reading(sessions: readonly Stored[], args = ['--session', 'session-stored'], rows = 8) {
  const store = persistence(sessions)
  const mounted = await mount({ args, columns: 40, rows, provide: (ctx) => ctx.provide('sessionPersistence', store) })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await settled()
  return { ...mounted, store, rows: (await mounted.terminal.read()).rows }
}

test('the transcript draws each event of the session that --session names: its seq and type, then its data as JSON', async () => {
  const { rows } = await reading([stored])
  assert.deepEqual(rows, ['▾ #0 user/message', '{', '  "text": "hello"', '}', '', '▾ #1 test/marker', '{}', ''])
})

test('when the transcript first has the Focus, the newest event is Marked', async () => {
  const { terminal } = await reading([stored])
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 5)], [false, true])
})

test('with no event yet, nothing is Marked, and the first event that comes is', async () => {
  const { ctx, dsh, terminal } = await talking()
  assert.equal(await terminal.inverseAt(0, 0), false)
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  assert.equal(await terminal.inverseAt(0, 0), true)
})

test('up and down move the Mark one event', async () => {
  const { terminal } = await reading([three], ['--session', 'session-stored'], 9)
  const marked = async () => [await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3), await terminal.inverseAt(0, 6)]
  assert.deepEqual(await marked(), [false, false, true])
  terminal.type(UP)
  assert.deepEqual(await marked(), [false, true, false])
  terminal.type(UP)
  assert.deepEqual(await marked(), [true, false, false])
  terminal.type(DOWN)
  assert.deepEqual(await marked(), [false, true, false])
})

test('up on the oldest event and down on the newest leave the Mark where it is', async () => {
  const { terminal } = await reading([three], ['--session', 'session-stored'], 9)
  const marked = async () => [await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 6)]
  assert.deepEqual(await marked(), [false, true])
  terminal.type(DOWN)
  assert.deepEqual(await marked(), [false, true])
  terminal.type(UP)
  terminal.type(UP)
  assert.deepEqual(await marked(), [true, false])
  terminal.type(UP)
  assert.deepEqual(await marked(), [true, false])
})

test('enter folds the Marked event to its one header line, and unfolds it again', async () => {
  const { rows, terminal } = await reading([stored])
  assert.deepEqual(rows, ['▾ #0 user/message', '{', '  "text": "hello"', '}', '', '▾ #1 test/marker', '{}', ''])
  terminal.type(ENTER)
  assert.deepEqual((await terminal.read()).rows, [
    '▾ #0 user/message',
    '{',
    '  "text": "hello"',
    '}',
    '',
    '▸ #1 test/marker (1 lines)',
    '',
    '',
  ])
  terminal.type(ENTER)
  assert.deepEqual((await terminal.read()).rows, ['▾ #0 user/message', '{', '  "text": "hello"', '}', '', '▾ #1 test/marker', '{}', ''])
})

test('the transcript scrolls to keep the Marked event in view', async () => {
  const { terminal } = await reading([three], ['--session', 'session-stored'], 3)
  const shown = async () => (await terminal.read()).rows
  assert.deepEqual(await shown(), ['▾ #2 test/three', '{}', ''])
  terminal.type(UP)
  assert.deepEqual(await shown(), ['▾ #1 test/two', '{}', ''])
  terminal.type(UP)
  assert.deepEqual(await shown(), ['▾ #0 test/one', '{}', ''])
  terminal.type(DOWN)
  assert.deepEqual(await shown(), ['▾ #1 test/two', '{}', ''])
})

test("as the Mark moves down within the rows shown, the transcript keeps the Marked event's header on the top row", async () => {
  const { terminal } = await reading([three], ['--session', 'session-stored'], 4)
  const shown = async () => (await terminal.read()).rows
  terminal.type(UP)
  terminal.type(UP)
  assert.deepEqual(await shown(), ['▾ #0 test/one', '{}', '', '▾ #1 test/two'])
  terminal.type(DOWN)
  assert.deepEqual(await shown(), ['▾ #1 test/two', '{}', '', '▾ #2 test/three'])
})

test("a click on an event's header line folds or unfolds that event, and Marks it", async () => {
  const store = persistence([three])
  const mounted = await mount({
    args: ['--session', 'session-stored'],
    columns: 40,
    rows: 10,
    provide: (ctx) => ctx.provide('sessionPersistence', store),
  })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await mounted.ctx.plugin(probe('composer', composerTakingKeys))
  await settled()
  const { terminal } = mounted
  terminal.type(clickAt(0, 0))
  assert.deepEqual((await terminal.read()).rows.slice(0, 6), ['▸ #0 test/one (1 lines)', '', '▾ #1 test/two', '{}', '', '▾ #2 test/three'])
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 5)], [true, false])
  terminal.type(clickAt(0, 0))
  assert.deepEqual((await terminal.read()).rows.slice(0, 4), ['▾ #0 test/one', '{}', '', '▾ #1 test/two'])
  assert.equal(await terminal.inverseAt(0, 0), true)
})

test("a folded event's header line ends with how many of its lines it hides, counted before the core wraps them", async () => {
  const wide: Stored = {
    id: 'session-stored',
    createdAt: 1,
    events: [{ seq: 0, type: 'test/long', time: 1, data: { text: '0123456789012345678901234567890' } }],
  }
  const { rows, terminal } = await reading([wide])
  assert.deepEqual(rows, ['▾ #0 test/long', '{', '  "text":', '"0123456789012345678901234567890"', '}', '', '', ''])
  terminal.type(ENTER)
  assert.deepEqual((await terminal.read()).rows.slice(0, 2), ['▸ #0 test/long (3 lines)', ''])
})

test('an event that is folded stays folded, and the Marked event stays Marked, as new events come and as the live block streams', async () => {
  const { ctx, dsh, terminal } = await talking(12)
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  terminal.type(UP)
  terminal.type(ENTER)
  dsh.commit(ctx, { seq: 2, type: 'turn/start', time: 3, data: {} })
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: 'Hel' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 0, text: 'lo' }))
  assert.deepEqual((await terminal.read()).rows, [
    '▸ #0 turn/start (1 lines)',
    '',
    '▾ #1 turn/start',
    '{}',
    '',
    '▾ #2 turn/start',
    '{}',
    '',
    '~ streaming',
    'text',
    'Hello',
    '',
  ])
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 5)], [true, false])
})

test('the live block is not an event: it cannot be Marked or folded', async () => {
  const { ctx, dsh, terminal } = await talking(5)
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: 'Hello' }))
  const live = (await terminal.read()).rows
  assert.deepEqual(live, ['~ streaming', 'text', 'Hello', '', ''])
  terminal.type(ENTER)
  terminal.type(UP)
  terminal.type(DOWN)
  terminal.type(clickAt(0, 0))
  assert.deepEqual([(await terminal.read()).rows, await terminal.inverseAt(0, 0)], [live, false])
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  const withEvent = (await terminal.read()).rows
  terminal.type(clickAt(0, 3))
  assert.deepEqual([(await terminal.read()).rows, await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3)], [withEvent, true, false])
})

test('when the transcript loses the Focus, its Mark is not drawn. When it has the Focus again, the same event is Marked', async () => {
  const store = persistence([three])
  const mounted = await mount({
    args: ['--session', 'session-stored'],
    columns: 40,
    rows: 10,
    provide: (ctx) => ctx.provide('sessionPersistence', store),
  })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await mounted.ctx.plugin(probe('composer', composerTakingKeys))
  await settled()
  const { terminal } = mounted
  const marks = async () => [await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3), await terminal.inverseAt(0, 6)]
  assert.deepEqual(await marks(), [false, false, false])
  terminal.type(SHIFT_TAB)
  assert.deepEqual(await marks(), [false, false, true])
  terminal.type(SHIFT_TAB)
  assert.deepEqual(await marks(), [false, false, false])
  terminal.type(SHIFT_TAB)
  assert.deepEqual(await marks(), [false, false, true])
})

test('with no event, up, down and enter do nothing', async () => {
  const { terminal } = await talking(3)
  const blank = (await terminal.read()).rows
  terminal.type(UP)
  terminal.type(DOWN)
  terminal.type(ENTER)
  assert.deepEqual([(await terminal.read()).rows, await terminal.inverseAt(0, 0)], [blank, false])
})

test('the transcript takes no other key: a key that would type does nothing, and esc still interrupts', async () => {
  const { ctx, dsh, terminal } = await talking(3)
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  const rows = (await terminal.read()).rows
  terminal.type('hi')
  assert.deepEqual((await terminal.read()).rows, rows)
  // A lone escape is told from the start of a sequence once nothing follows it.
  terminal.type('\x1b')
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual([(await terminal.read()).rows, dsh.cancels.length], [rows, 1])
})

test('the first event that comes after the Focus left an empty transcript keeps its Mark', async () => {
  const dsh = agents()
  const mounted = await mount({ columns: 40, rows: 10, provide: dsh.provide })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await mounted.ctx.plugin(probe('composer', composerTakingKeys))
  await settled()
  const { ctx, terminal } = mounted
  terminal.type(SHIFT_TAB)
  terminal.type(SHIFT_TAB)
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  terminal.type(SHIFT_TAB)
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3)], [true, false])
})

test("an event's type is Untrusted Text, so its colour and control sequences are taken out", async () => {
  const styled: Stored = { id: 'session-stored', createdAt: 3, events: [{ seq: 0, type: 'test/\x1b[31mred\x07', time: 3, data: {} }] }
  const { rows, terminal } = await reading([styled], undefined, 3)
  assert.deepEqual([rows[0], await terminal.colourAt(8, 0)], ['▾ #0 test/red', 'default'])
})

async function talking(rows = 8) {
  const dsh = agents()
  const mounted = await mount({ columns: 40, rows, provide: dsh.provide })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await settled()
  return { ...mounted, dsh, drawn: async () => (await mounted.terminal.read()).rows }
}

test('the transcript draws each event that the session commits, as it commits it', async () => {
  const { ctx, dsh, drawn } = await talking()
  dsh.commit(ctx, { seq: 0, type: 'user/message', time: 1, data: { text: 'hi' } })
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  assert.deepEqual(await drawn(), ['▾ #0 user/message', '{', '  "text": "hi"', '}', '', '▾ #1 turn/start', '{}', ''])
})

test('a transcript loaded after the session committed events draws them too', async () => {
  const dsh = agents()
  const { ctx, ready, terminal } = await mount({ columns: 40, rows: 4, provide: dsh.provide })
  ready()
  await settled()
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  await ctx.plugin(transcript)
  assert.deepEqual((await terminal.read()).rows, ['▾ #0 turn/start', '{}', '', ''])
})

const chunk = (index: number, streamed: object) => ({ type: 'chunk', attemptId: 'a1', revision: 1, index, time: 1, chunk: streamed })

test('the answer that streams is drawn as one live block: the deltas of each content block glued, in order', async () => {
  const { ctx, dsh, drawn } = await talking()
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'reasoning-delta', index: 0, text: 'think' }))
  dsh.stream(ctx, chunk(1, { type: 'reasoning-delta', index: 0, text: 'ing' }))
  dsh.stream(ctx, chunk(2, { type: 'text-delta', index: 1, text: 'Hel' }))
  dsh.stream(ctx, chunk(3, { type: 'tool-call-delta', index: 2, id: 't1', name: 'read', argumentsDelta: '{"pa' }))
  dsh.stream(ctx, chunk(4, { type: 'text-delta', index: 1, text: 'lo\nthere' }))
  dsh.stream(ctx, chunk(5, { type: 'tool-call-delta', index: 2, id: 't1', argumentsDelta: 'th":1}' }))
  assert.deepEqual(await drawn(), ['~ streaming', 'reasoning', 'thinking', 'text', 'Hello', 'there', 'tool-call read', '{"path":1}'])
})

test('the event that the answer commits replaces its live block', async () => {
  const { ctx, dsh, drawn } = await talking(6)
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: 'Hello' }))
  dsh.commit(ctx, { seq: 3, type: 'assistant/message', time: 2, data: { text: 'Hello' } })
  dsh.stream(ctx, {
    type: 'end',
    attemptId: 'a1',
    revision: 1,
    index: 1,
    outcome: { kind: 'committed', eventType: 'assistant/message', seq: 3 },
  })
  assert.deepEqual(await drawn(), ['▾ #3 assistant/message', '{', '  "text": "Hello"', '}', '', ''])
})

test("another session's events and another agent's answer, such as a subagent's, are not drawn", async () => {
  const { ctx, drawn } = await talking(3)
  ctx.emit('session/event', { header: { id: 'session-other' } } as never, { seq: 0, type: 'turn/start', time: 1, data: {} } as never)
  ctx.emit('agent/assistant-stream', { agent: {}, frame: { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 } } as never)
  assert.deepEqual(await drawn(), ['', '', ''])
})

test('a transcript loaded with the core, as dsh loads them, draws the session once it opens', async () => {
  const dsh = agents()
  const { ctx, ready, terminal } = await mount({
    columns: 40,
    rows: 3,
    provide: (each) => {
      dsh.provide(each)
      void each.plugin(transcript)
    },
  })
  ready()
  await settled()
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  assert.deepEqual((await terminal.read()).rows, ['▾ #0 turn/start', '{}', ''])
})

test("a tool call's name that streams after its first delta still labels it", async () => {
  const { ctx, dsh, drawn } = await talking(3)
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'tool-call-delta', index: 0, id: 't1', argumentsDelta: '{' }))
  dsh.stream(ctx, chunk(1, { type: 'tool-call-delta', index: 0, id: 't1', name: 'read', argumentsDelta: '}' }))
  assert.deepEqual(await drawn(), ['~ streaming', 'tool-call read', '{}'])
})
