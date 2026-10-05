import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as transcript from '../../src/plugins/transcript/index.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'
import { agents } from '../support/agents.ts'
import type { Stored } from '../support/sessions.ts'

const settled = () => new Promise((resolve) => setImmediate(resolve))

const stored: Stored = {
  id: 'session-stored',
  createdAt: 1,
  events: [
    { seq: 0, type: 'user/message', time: 2, data: { text: 'hello' } },
    { seq: 1, type: 'test/marker', time: 3, data: {} },
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
  assert.deepEqual(rows, ['#0 user/message', '{', '  "text": "hello"', '}', '', '#1 test/marker', '{}', ''])
})

test("an event's type is Untrusted Text, so its colour and control sequences are taken out", async () => {
  const styled: Stored = { id: 'session-stored', createdAt: 3, events: [{ seq: 0, type: 'test/\x1b[31mred\x07', time: 3, data: {} }] }
  const { rows, terminal } = await reading([styled], undefined, 3)
  assert.deepEqual([rows[0], await terminal.colourAt(8, 0)], ['#0 test/red', 'default'])
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
  assert.deepEqual(await drawn(), ['#0 user/message', '{', '  "text": "hi"', '}', '', '#1 turn/start', '{}', ''])
})

test('a transcript loaded after the session committed events draws them too', async () => {
  const dsh = agents()
  const { ctx, ready, terminal } = await mount({ columns: 40, rows: 4, provide: dsh.provide })
  ready()
  await settled()
  dsh.commit(ctx, { seq: 0, type: 'turn/start', time: 1, data: {} })
  await ctx.plugin(transcript)
  assert.deepEqual((await terminal.read()).rows, ['#0 turn/start', '{}', '', ''])
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
  assert.deepEqual(await drawn(), ['#3 assistant/message', '{', '  "text": "Hello"', '}', '', ''])
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
  assert.deepEqual((await terminal.read()).rows, ['#0 turn/start', '{}', ''])
})

test("a tool call's name that streams after its first delta still labels it", async () => {
  const { ctx, dsh, drawn } = await talking(3)
  dsh.stream(ctx, { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 1 })
  dsh.stream(ctx, chunk(0, { type: 'tool-call-delta', index: 0, id: 't1', argumentsDelta: '{' }))
  dsh.stream(ctx, chunk(1, { type: 'tool-call-delta', index: 0, id: 't1', name: 'read', argumentsDelta: '}' }))
  assert.deepEqual(await drawn(), ['~ streaming', 'tool-call read', '{}'])
})
