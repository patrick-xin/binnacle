import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as transcript from '../../src/plugins/transcript/index.ts'
import type { EventLook, LiveBlock, LiveLook, TranscriptState } from '../../src/plugins/transcript/index.ts'
import { failed, isPrompt, textOf, withoutReasoning } from '../../src/plugins/transcript/index.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { gestureTable } from '../../src/core/gestures.ts'
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
  ctx.binnacle.layout('composer', { place: 'composer.input' })
  ctx.binnacle.place('composer.input', { lines: () => [''], key: () => false })
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

const stateOf = (ctx: Context) => ctx.binnacle.modelOf<TranscriptState>('transcript')

test("the transcript's state is the model transcript: its events, the live blocks in the answer's order, the folds and the Mark", async () => {
  const { ctx, dsh, terminal } = await talking(12)
  const model = stateOf(ctx)
  assert.deepEqual(model.state, { events: [], live: undefined, folded: [], marked: undefined })
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  terminal.type(ENTER)
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'tool-call-delta', index: 2, id: 't1', argumentsDelta: '{' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 1, text: 'Hi' }))
  dsh.stream(ctx, chunk(2, { type: 'tool-call-delta', index: 2, id: 't1', name: 'read', argumentsDelta: '}' }))
  dsh.stream(ctx, chunk(3, { type: 'reasoning-delta', index: 0, text: 'hm' }))
  await terminal.read()
  assert.deepEqual(model.state, {
    events: [
      { seq: 0, type: 'turn/start', time: 1, data: {} },
      { seq: 1, type: 'turn/start', time: 2, data: {} },
    ],
    live: [
      { kind: 'reasoning', text: 'hm' },
      { kind: 'text', text: 'Hi' },
      { kind: 'tool-call', text: '{}', name: 'read' },
    ],
    folded: [0],
    marked: 0,
  })
  dsh.stream(ctx, {
    type: 'end',
    attemptId: 'a1',
    revision: 1,
    index: 4,
    outcome: { kind: 'committed', eventType: 'assistant/message', seq: 2 },
  })
  await terminal.read()
  assert.equal(stateOf(ctx).state?.live, undefined)
})

test('an author who sets folded folds and unfolds an event, and one who sets marked Marks it', async () => {
  const { ctx, dsh, terminal } = await talking(9)
  dsh.commit(ctx, { seq: 0, type: 'test/one', time: 1, data: {} })
  dsh.commit(ctx, { seq: 1, type: 'test/two', time: 2, data: {} })
  stateOf(ctx).set((state) => {
    state.folded.push(0)
    state.marked = 0
  })
  assert.deepEqual((await terminal.read()).rows.slice(0, 4), ['▸ #0 test/one (1 lines)', '', '▾ #1 test/two', '{}'])
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 2)], [true, false])
  stateOf(ctx).set((state) => {
    state.folded = []
  })
  assert.deepEqual((await terminal.read()).rows.slice(0, 3), ['▾ #0 test/one', '{}', ''])
})

test('an author who watches the model and pushes each tool result onto folded has each tool result fold when it comes', async () => {
  const { ctx, dsh, drawn } = await talking(6)
  const model = stateOf(ctx)
  model.watch(() => {
    const state = model.state!
    const fresh = state.events.filter((event) => event.type === 'tool/result' && !state.folded.includes(event.seq))
    if (fresh.length > 0) model.set((each) => each.folded.push(...fresh.map((event) => event.seq)))
  })
  dsh.commit(ctx, { seq: 0, type: 'tool/result', time: 1, data: { ok: true } })
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  dsh.commit(ctx, { seq: 2, type: 'tool/result', time: 3, data: { ok: true } })
  assert.deepEqual(await drawn(), ['▸ #0 tool/result (3 lines)', '', '▾ #1 turn/start', '{}', '', '▸ #2 tool/result (3 lines)'])
})

test('an author who sets events has them replaced at the next event', async () => {
  const { ctx, dsh, drawn } = await talking(6)
  dsh.commit(ctx, { seq: 0, type: 'test/one', time: 1, data: {} })
  stateOf(ctx).set((state) => {
    state.events = []
  })
  assert.deepEqual(await drawn(), ['', '', '', '', '', ''])
  dsh.commit(ctx, { seq: 1, type: 'test/two', time: 2, data: {} })
  assert.deepEqual(await drawn(), ['▾ #0 test/one', '{}', '', '▾ #1 test/two', '{}', ''])
})

test('an author who sets live has it replaced at the next event, whether or not an answer streams', async () => {
  const { ctx, dsh, drawn } = await talking(6)
  stateOf(ctx).set((state) => {
    state.live = [{ kind: 'text', text: 'author' }]
  })
  assert.deepEqual(await drawn(), ['~ streaming', 'text', 'author', '', '', ''])
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  assert.deepEqual([await drawn(), stateOf(ctx).state?.live], [['▾ #0 turn/start', '{}', '', '', '', ''], undefined])
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'text-delta', index: 0, text: 'Hi' }))
  stateOf(ctx).set((state) => {
    state.live = [{ kind: 'text', text: 'author' }]
  })
  await drawn()
  dsh.commit(ctx, { seq: 1, type: 'turn/start', time: 2, data: {} })
  assert.deepEqual((await drawn()).slice(3), ['▾ #1 turn/start', '{}', ''])
  assert.deepEqual(stateOf(ctx).state?.live, [{ kind: 'text', text: 'Hi' }])
})

test("up, down and enter are the actions transcript.up, transcript.down and transcript.fold, of the Place transcript, with the Gesture Table's tui.select. keys", async () => {
  const { ctx } = await talking()
  const keys = ['transcript.up', 'transcript.down', 'transcript.fold'].map((id) => ctx.binnacle.keysOf(id))
  assert.deepEqual(keys, [
    gestureTable.getKeys('tui.select.up'),
    gestureTable.getKeys('tui.select.down'),
    gestureTable.getKeys('tui.select.confirm'),
  ])
  assert.deepEqual(ctx.binnacle.keysOf('transcript.click'), ['click'])
  assert.deepEqual(
    ctx.binnacle.gestures.actionsOf(UP).filter((id) => id.startsWith('transcript.')),
    ['transcript.up'],
  )
})

test('an author binds transcript.down to j and transcript.up to k, and j and k move the Mark', async () => {
  const { ctx, terminal } = await reading([three], ['--session', 'session-stored'], 9)
  ctx.binnacle.bind('transcript.down', ['j'])
  ctx.binnacle.bind('transcript.up', ['k'])
  const marked = async () => [await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3), await terminal.inverseAt(0, 6)]
  terminal.type('k')
  assert.deepEqual(await marked(), [false, true, false])
  terminal.type('k')
  assert.deepEqual(await marked(), [true, false, false])
  terminal.type('j')
  assert.deepEqual(await marked(), [false, true, false])
  terminal.type(UP)
  assert.deepEqual(await marked(), [false, true, false])
})

test('an author sets transcript.fold by its id, and runs beneath() to keep the default', async () => {
  const { ctx, terminal } = await reading([stored])
  const runs: number[] = []
  ctx.binnacle.action('transcript.fold', {
    run: (_, beneath) => {
      runs.push(stateOf(ctx).state!.marked!)
      beneath()
    },
  })
  terminal.type(ENTER)
  assert.deepEqual([runs, (await terminal.read()).rows.slice(5, 6)], [[1], ['▸ #1 test/marker (1 lines)']])
})

test("a click on an event's header runs transcript.click, which an author sets by its id", async () => {
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
  const { ctx, terminal } = mounted
  const clicked: (number | undefined)[] = []
  ctx.binnacle.action('transcript.click', { run: (at) => clicked.push(at?.line) })
  const rows = (await terminal.read()).rows
  terminal.type(clickAt(0, 3))
  assert.deepEqual([clicked, (await terminal.read()).rows], [[3], rows])
})

const calls: Stored = {
  id: 'session-stored',
  createdAt: 1,
  events: [
    { seq: 0, type: 'user/message', time: 2, data: { text: 'hello' } },
    { seq: 1, type: 'tool/call', time: 3, data: { name: 'read', arguments: '{"path":"a/very/long/path/to/a/file.ts"}' } },
    { seq: 2, type: 'tool/call', time: 4, data: { name: 'ls', arguments: '{}' } },
  ],
}

const oneLine = (ctx: Context) =>
  ctx.binnacle.look<EventLook>('transcript.event.tool/call', () => (event, { width }) => {
    const { name, arguments: args } = event.data as { name: string; arguments: string }
    return [`* ${name}(${args})`.slice(0, width)]
  })

test('an event draws through the Look transcript.event.<type>, given the event and the width, and returns its lines', async () => {
  const { ctx, terminal } = await reading([calls])
  oneLine(ctx)
  assert.deepEqual((await terminal.read()).rows, [
    '▾ #0 user/message',
    '{',
    '  "text": "hello"',
    '}',
    '',
    '* read({"path":"a/very/long/path/to/a/fi',
    '* ls({})',
    '',
  ])
  assert.deepEqual([await terminal.inverseAt(0, 5), await terminal.inverseAt(0, 6)], [false, true])
})

test('the Look transcript.event lies beneath each transcript.event.<type>, and is given whether the event is folded', async () => {
  const { ctx, terminal } = await reading([stored])
  ctx.binnacle.look<EventLook>('transcript.event', (beneath) => (event, at) => [
    `${at.folded ? '+' : '-'} ${event.type}`,
    ...beneath(event, at).slice(1),
  ])
  ctx.binnacle.look<EventLook>(
    'transcript.event.user/message',
    (beneath) => (event, at) => beneath(event, at).map((line) => line.toUpperCase()),
  )
  assert.deepEqual((await terminal.read()).rows.slice(0, 7), ['- USER/MESSAGE', '{', '  "TEXT": "HELLO"', '}', '', '- test/marker', '{}'])
  terminal.type(ENTER)
  assert.deepEqual((await terminal.read()).rows.slice(5, 7), ['+ test/marker', ''])
})

test("the view Marks an event's first line that its Look draws, along the whole line however the Look styles it", async () => {
  const { ctx, terminal } = await reading([stored], undefined, 3)
  ctx.binnacle.look<EventLook>('transcript.event', () => (event) => [`\x1b[1m>\x1b[0m ${ctx.binnacle.paint('muted', event.type)}`])
  assert.deepEqual((await terminal.read()).rows, ['> user/message', '> test/marker', ''])
  assert.deepEqual([await terminal.inverseAt(0, 1), await terminal.inverseAt(2, 1), await terminal.inverseAt(0, 0)], [true, true, false])
})

test('the Mark holds past a reset that a Look joins with another style in one sequence', async () => {
  const { ctx, terminal } = await reading([stored], undefined, 3)
  ctx.binnacle.look<EventLook>('transcript.event', () => () => ['prefix\x1b[0;31m suffix'])
  assert.deepEqual([await terminal.inverseAt(0, 1), await terminal.inverseAt(8, 1)], [true, true])
})

test('a click on the first line of an event that a Look draws lands on that event', async () => {
  const store = persistence([calls])
  const mounted = await mount({
    args: ['--session', 'session-stored'],
    columns: 40,
    rows: 10,
    provide: (each) => each.provide('sessionPersistence', store),
  })
  mounted.ready()
  await mounted.ctx.plugin(transcript)
  await mounted.ctx.plugin(probe('composer', composerTakingKeys))
  await settled()
  const { ctx, terminal } = mounted
  oneLine(ctx)
  await terminal.read()
  terminal.type(clickAt(0, 6))
  await terminal.read()
  assert.deepEqual([stateOf(ctx).state?.marked, stateOf(ctx).state?.folded], [2, [2]])
})

test('an event whose Look draws no line takes no row, and up and down pass over it', async () => {
  const { ctx, terminal } = await reading([three], ['--session', 'session-stored'], 9)
  ctx.binnacle.look<EventLook>('transcript.event.test/two', () => () => [])
  assert.deepEqual((await terminal.read()).rows, ['▾ #0 test/one', '{}', '', '▾ #2 test/three', '{}', '', '', '', ''])
  terminal.type(UP)
  assert.deepEqual([await terminal.inverseAt(0, 0), stateOf(ctx).state?.marked], [true, 0])
  terminal.type(DOWN)
  assert.deepEqual([await terminal.inverseAt(0, 3), stateOf(ctx).state?.marked], [true, 2])
})

test('a Marked event that draws no line has the Mark drawn on the next event that draws, else the one before, else nowhere, and marked stays', async () => {
  const { ctx, terminal } = await reading([three], ['--session', 'session-stored'], 9)
  const hidden = new Set(['test/two'])
  const handle = ctx.binnacle.look<EventLook>(
    'transcript.event',
    (beneath) => (event, at) => (hidden.has(event.type) ? [] : beneath(event, at)),
  )
  stateOf(ctx).set((state) => (state.marked = 1))
  assert.deepEqual([await terminal.inverseAt(0, 0), await terminal.inverseAt(0, 3)], [false, true])
  hidden.add('test/three')
  handle.dispose()
  ctx.binnacle.look<EventLook>('transcript.event', (beneath) => (event, at) => (hidden.has(event.type) ? [] : beneath(event, at)))
  assert.deepEqual([(await terminal.read()).rows[0], await terminal.inverseAt(0, 0)], ['▾ #0 test/one', true])
  hidden.add('test/one')
  ctx.binnacle.look<EventLook>('transcript.event', (beneath) => (event, at) => (hidden.has(event.type) ? [] : beneath(event, at)))
  assert.deepEqual((await terminal.read()).rows, ['', '', '', '', '', '', '', '', ''])
  hidden.clear()
  ctx.binnacle.look<EventLook>('transcript.event', (beneath) => (event, at) => beneath(event, at))
  assert.deepEqual([stateOf(ctx).state?.marked, await terminal.inverseAt(0, 3)], [1, true])
})

test('a marked that is not an event is drawn on the next event that draws, else the one before', async () => {
  const { ctx, terminal } = await reading([calls], undefined, 8)
  oneLine(ctx)
  stateOf(ctx).set((state) => (state.marked = 1.5))
  assert.deepEqual([await terminal.inverseAt(0, 6), stateOf(ctx).state?.marked], [true, 1.5])
  stateOf(ctx).set((state) => (state.marked = 9))
  assert.deepEqual([await terminal.inverseAt(0, 6), await terminal.inverseAt(0, 5)], [true, false])
})

test('up, down and enter act from where the Mark is drawn, and set marked to the event they reach', async () => {
  const { ctx, terminal } = await reading([three], ['--session', 'session-stored'], 9)
  ctx.binnacle.look<EventLook>('transcript.event.test/two', () => () => [])
  stateOf(ctx).set((state) => (state.marked = 1))
  terminal.type(ENTER)
  await terminal.read()
  assert.deepEqual([stateOf(ctx).state?.folded, stateOf(ctx).state?.marked], [[2], 1])
  terminal.type(UP)
  await terminal.read()
  assert.equal(stateOf(ctx).state?.marked, 0)
})

test('the live block draws through the Look transcript.live, given its blocks and the width', async () => {
  const { ctx, dsh, drawn } = await talking(3)
  const given: [readonly LiveBlock[], number][] = []
  ctx.binnacle.look<LiveLook>('transcript.live', (beneath) => (blocks, width) => {
    given.push([blocks, width])
    return beneath(
      blocks.filter((block) => block.kind !== 'reasoning'),
      width,
    )
  })
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'reasoning-delta', index: 0, text: 'think' }))
  dsh.stream(ctx, chunk(1, { type: 'text-delta', index: 1, text: 'Hello' }))
  assert.deepEqual(await drawn(), ['~ streaming', 'text', 'Hello'])
  assert.deepEqual(given.at(-1), [
    [
      { kind: 'reasoning', text: 'think' },
      { kind: 'text', text: 'Hello' },
    ],
    40,
  ])
})

const anEvent = (seq: number, type: string, data: unknown) => ({ seq, type, time: seq + 1, data }) as unknown as SessionEvent
const prompt = anEvent(0, 'user/message', {
  role: 'user',
  source: { kind: 'user' },
  content: [
    { type: 'text', text: 'fix ' },
    { type: 'text', text: 'the bug' },
  ],
})
const context = anEvent(1, 'user/message', {
  role: 'user',
  source: { kind: 'file-change' },
  content: [{ type: 'text', text: 'a.ts changed' }],
})
const answer = anEvent(2, 'assistant/message', {
  turn: 1,
  step: 1,
  message: {
    role: 'assistant',
    source: { kind: 'model', provider: 'p', model: 'm' },
    content: [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'Done.' },
      { type: 'tool-call', id: 'c1', name: 'ls', arguments: '{}' },
    ],
  },
  stream: [
    { type: 'chunk', time: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } },
    { type: 'reasoning-chunks', time0: 1, index: 0, dt: [], texts: ['think'] },
    { type: 'chunk', time: 2, chunk: { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } } },
    { type: 'chunk', time: 3, chunk: { type: 'reasoning-delta', index: 0, text: 'more' } },
    { type: 'chunk', time: 3, chunk: { type: 'block-start', index: 1, blockType: 'text' } },
    { type: 'text-chunks', time0: 3, index: 1, dt: [], texts: ['Done.'] },
    { type: 'chunk', time: 4, chunk: { type: 'block-end', index: 1, block: { type: 'text', text: 'Done.' } } },
  ],
})
const result = (seq: number, isError: boolean) =>
  anEvent(seq, 'tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'tool', source: { kind: 'tool', callId: 'c1' }, toolCallId: 'c1', isError, content: [{ type: 'text', text: 'no' }] },
  })
const odd = [
  anEvent(9, 'test/marker', undefined),
  anEvent(9, 'user/message', null),
  anEvent(9, 'assistant/message', { message: 7, stream: 'x' }),
  anEvent(9, 'tool/result', []),
]

test("textOf gives the text of a person's message or an answer's, its text blocks joined, and '' for another event", () => {
  assert.deepEqual(
    [textOf(prompt), textOf(context), textOf(answer), textOf(result(3, false)), ...odd.map(textOf)],
    ['fix the bug', 'a.ts changed', 'Done.', '', '', '', '', ''],
  )
})

test('isPrompt says whether an event is a prompt the person typed, not context that dsh added', () => {
  assert.deepEqual(
    [isPrompt(prompt), isPrompt(context), isPrompt(answer), ...odd.map(isPrompt)],
    [true, false, false, false, false, false, false],
  )
})

test('failed says whether an event is a tool result that failed', () => {
  const withError = anEvent(5, 'tool/result', {
    turn: 1,
    step: 1,
    message: { isError: true, content: [] },
    error: { name: 'E', code: 'X' },
  })
  assert.deepEqual(
    [failed(result(3, true)), failed(withError), failed(result(4, false)), failed(answer), ...odd.map(failed)],
    [true, true, false, false, false, false, false, false],
  )
})

test('withoutReasoning takes the reasoning out of an answer, from its message and from its stream, and leaves the event it is given as it was', () => {
  const before = JSON.stringify(answer)
  const without = withoutReasoning(answer)
  assert.deepEqual(without, {
    ...answer,
    data: {
      ...(answer.data as object),
      message: {
        role: 'assistant',
        source: { kind: 'model', provider: 'p', model: 'm' },
        content: [
          { type: 'text', text: 'Done.' },
          { type: 'tool-call', id: 'c1', name: 'ls', arguments: '{}' },
        ],
      },
      stream: [
        { type: 'chunk', time: 3, chunk: { type: 'block-start', index: 1, blockType: 'text' } },
        { type: 'text-chunks', time0: 3, index: 1, dt: [], texts: ['Done.'] },
        { type: 'chunk', time: 4, chunk: { type: 'block-end', index: 1, block: { type: 'text', text: 'Done.' } } },
      ],
    },
  })
  assert.equal(JSON.stringify(answer), before)
})

test('withoutReasoning takes the reasoning out of the stream of an attempt that committed no message', () => {
  const attempt = anEvent(6, 'assistant/attempt', {
    turn: 1,
    step: 1,
    stream: [{ type: 'reasoning-chunks', time0: 1, index: 0, dt: [], texts: ['hm'] }],
  })
  assert.deepEqual(withoutReasoning(attempt).data, { turn: 1, step: 1, stream: [] })
})

test('withoutReasoning gives an event with no reasoning as it is', () => {
  const plain = withoutReasoning(answer)
  assert.deepEqual(
    [prompt, plain, result(3, true), ...odd].map((each) => withoutReasoning(each) === each),
    [true, true, true, true, true, true, true],
  )
})

const answered: Stored = { id: 'session-stored', createdAt: 1, events: [prompt, context, answer] }

test("an author hides an answer's reasoning with beneath(withoutReasoning(event), at)", async () => {
  const { ctx, terminal } = await reading([answered], undefined, 60)
  ctx.binnacle.look<EventLook>('transcript.event.assistant/message', (beneath) => (event, at) => beneath(withoutReasoning(event), at))
  const rows = (await terminal.read()).rows
  assert.deepEqual(
    [rows.some((row) => row.includes('Done.')), rows.some((row) => row.includes('think') || row.includes('reasoning'))],
    [true, false],
  )
})

test("an author draws the person's prompts with isPrompt and textOf, and leaves dsh's context to the default", async () => {
  const { ctx, terminal } = await reading([answered], undefined, 4)
  ctx.binnacle.look<EventLook>(
    'transcript.event.user/message',
    (beneath) => (event, at) => (isPrompt(event) ? [`> ${textOf(event)}`] : beneath(event, at).slice(0, 1)),
  )
  ctx.binnacle.look<EventLook>('transcript.event.assistant/message', () => (event) => [textOf(event)])
  assert.deepEqual((await terminal.read()).rows, ['> fix the bug', '▾ #1 user/message', 'Done.', ''])
})
