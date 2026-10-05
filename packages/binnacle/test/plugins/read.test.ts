import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as read from '../../src/plugins/read/index.ts'
import { mount } from '../support/mount.ts'
import { persistence } from '../support/sessions.ts'
import type { Stored } from '../support/sessions.ts'

const older: Stored = {
  id: 'session-older',
  createdAt: 1,
  events: [{ seq: 0, type: 'test/marker', time: 1, data: { said: 'older' } }],
}

const newer: Stored = {
  id: 'session-newer',
  createdAt: 2,
  events: [
    { seq: 0, type: 'user/message', time: 2, data: { text: 'hello' } },
    { seq: 1, type: 'test/marker', time: 3, data: {} },
  ],
}

/** binnacle's core, ready, with the Read view loaded over these stored sessions. */
async function opened(args: string[], stored: readonly Stored[], rows = 10) {
  const mounted = await mount({ args, columns: 40, rows })
  const store = persistence(stored)
  mounted.ctx.provide('sessionPersistence', store)
  mounted.ready()
  await mounted.ctx.plugin(read)
  // The session is read after the plugin loads; let its reads settle.
  await new Promise((resolve) => setImmediate(resolve))
  return { ...mounted, store, rows: (await mounted.terminal.read()).rows }
}

test('the Read view shows each event of the session the command line names: its seq and type, then its data', async () => {
  const { rows, store } = await opened(['--session', 'session-older'], [older, newer])
  assert.deepEqual(store.opened, ['session-older'])
  assert.deepEqual(rows, ['#0 test/marker', '{', '  "said": "older"', '}', '', '', '', '', '', ''])
})

test('with no session named, the Read view reads the newest stored session', async () => {
  const { rows, store } = await opened([], [newer, older])
  assert.deepEqual(store.opened, ['session-newer'])
  assert.deepEqual(rows.slice(0, 4), ['#0 user/message', '{', '  "text": "hello"', '}'])
})

test('with no stored session, the Read view says so', async () => {
  const { rows } = await opened([], [], 2)
  assert.deepEqual(rows, ['No stored session to read.', ''])
})

test('a session the Read view cannot read is said on the screen, with why', async () => {
  const { rows } = await opened(['--session', 'session-gone'], [older], 2)
  assert.deepEqual(rows, ['Could not read the session: no session', 'session-gone'])
})
