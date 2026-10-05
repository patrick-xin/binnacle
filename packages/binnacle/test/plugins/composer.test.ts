import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as composer from '../../src/plugins/composer/index.ts'
import { mount } from '../support/mount.ts'
import { agents } from '../support/agents.ts'
import { persistence } from '../support/sessions.ts'

async function chat(columns = 20, rows = 5, provide?: (ctx: Context) => void, args: string[] = []) {
  const mounted = await mount({ args, columns, rows, ...(provide === undefined ? {} : { provide }) })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  // The session opens after the core loads; let it settle.
  await new Promise((resolve) => setImmediate(resolve))
  const typed = async (...keys: string[]) => {
    for (const key of keys) mounted.terminal.type(key)
    return (await mounted.terminal.read()).rows
  }
  return { ...mounted, typed }
}

const RULE = '─'.repeat(20)

test('what a person types is drawn in the composer, between its rules', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('h', 'i'), ['', '', RULE, 'hi ', RULE])
})

test('enter clears the draft and keeps it in the history, and up brings it back', async () => {
  const { typed } = await chat(20, 5, agents().provide)
  assert.deepEqual(
    [await typed('h', 'i', '\r'), await typed('\x1b[A')],
    [
      ['', '', RULE, ' ', RULE],
      ['', '', RULE, 'hi', RULE],
    ],
  )
})

test('ctrl+c passes the composer by to the Key Table, and quits', async () => {
  const { typed, exits } = await chat()
  await typed('h', '\x03')
  assert.deepEqual(exits, [0])
})

test('a key that the kitty protocol reports released is not typed a second time', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('\x1b[?7u', '\x1b[97u', '\x1b[97;1:3u'), ['', '', RULE, 'a ', RULE])
})

test("shift+enter makes a new line, as the kitty protocol and modifyOtherKeys send it, and as pi-tui's fallbacks ctrl+j and a backslash before enter do", async () => {
  const { typed } = await chat(20, 8, agents().provide)
  const rows = await typed('a', '\x1b[13;2u', 'b', '\x1b[27;2;13~', 'c', '\n', 'd', '\\', '\r', 'e')
  assert.deepEqual(rows, ['', RULE, 'a', 'b', 'c', 'd', 'e ', RULE])
})

test('a paste keeps its new lines in the draft, and is not sent', async () => {
  const { typed } = await chat(20, 6)
  assert.deepEqual(await typed('\x1b[200~one\ntwo\x1b[201~'), ['', '', RULE, 'one', 'two ', RULE])
})

async function authored(ctx: Context, author: (plugin: Context) => void) {
  const plugin = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: author })
  await plugin
  return plugin
}

test('a Screen shown over the Chat that gives no Place the Focus gives the composer no key, though it draws it', async () => {
  const { ctx, typed } = await chat()
  const shown = await authored(ctx, (plugin) => {
    plugin.binnacle.show({ name: 'detail', layout: { column: [{ place: 'detail' }, { place: 'composer', size: 'content' }] } })
  })
  const whileShown = await typed('x')
  await shown.dispose()
  assert.deepEqual(
    [whileShown, await typed('y')],
    [
      ['', '', RULE, ' ', RULE],
      ['', '', RULE, 'y ', RULE],
    ],
  )
})

test('a layout of the Chat with no composer Place gives the composer no key', async () => {
  const { ctx, typed } = await chat()
  const laid = await authored(ctx, (plugin) => {
    plugin.binnacle.layout('chat', { place: 'transcript' })
  })
  await typed('x')
  await laid.dispose()
  assert.deepEqual(await typed('y'), ['', '', RULE, 'y ', RULE])
})

test("the terminal's cursor is put on the composer's cursor, for an input method", async () => {
  const { typed, terminal } = await chat()
  await typed('h', 'i', '\x1b[D')
  assert.deepEqual((await terminal.read()).cursor, { x: 1, y: 3 })
})

test('enter sends the draft to the agent as a prompt, and steers the turn that runs', async () => {
  const dsh = agents()
  const { typed } = await chat(20, 5, dsh.provide)
  await typed('h', 'i', '\r')
  dsh.agent.status = 'running'
  await typed('o', 'k', '\r')
  assert.deepEqual(dsh.sent, [
    { how: 'followup', text: 'hi' },
    { how: 'steer', text: 'ok' },
  ])
})

test('enter keeps the draft while no agent takes it: a stored session that is read, or a session not open yet', async () => {
  const store = persistence([{ id: 'session-stored', createdAt: 1, events: [] }])
  const { typed: typedToStored } = await chat(20, 5, (ctx) => ctx.provide('sessionPersistence', store), ['--session', 'session-stored'])
  const { typed: typedBeforeOpen } = await chat()
  assert.deepEqual(
    [await typedToStored('h', 'i', '\r'), await typedBeforeOpen('h', 'i', '\r')],
    [
      ['', '', RULE, 'hi ', RULE],
      ['', '', RULE, 'hi ', RULE],
    ],
  )
})
