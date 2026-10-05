import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as transcript from '../../src/plugins/transcript/index.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'
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
