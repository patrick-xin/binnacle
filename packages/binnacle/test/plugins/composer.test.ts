import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import * as composer from '../../src/plugins/composer/index.ts'
import { mount } from '../support/mount.ts'

async function chat(columns = 20, rows = 5) {
  const mounted = await mount({ columns, rows })
  mounted.ready()
  await mounted.ctx.plugin(composer)
  const typed = async (...keys: string[]) => {
    for (const key of keys) mounted.terminal.type(key)
    return (await mounted.terminal.read()).rows
  }
  return { ...mounted, typed }
}

const RULE = '─'.repeat(20)

test('what a person types is drawn in the composer, between its rules', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('h', 'i'), ['', '', RULE, 'hi', RULE])
})

test('enter clears the draft and keeps it in the history, and up brings it back', async () => {
  const { typed } = await chat()
  assert.deepEqual(
    [await typed('h', 'i', '\r'), await typed('\x1b[A')],
    [
      ['', '', RULE, '', RULE],
      ['', '', RULE, 'hi', RULE],
    ],
  )
})

test("ctrl+c passes the composer by to the core's key table, and quits", async () => {
  const { typed, exits } = await chat()
  await typed('h', '\x03')
  assert.deepEqual(exits, [0])
})

test('a key that the kitty protocol reports released is not typed a second time', async () => {
  const { typed } = await chat()
  assert.deepEqual(await typed('\x1b[?7u', '\x1b[97u', '\x1b[97;1:3u'), ['', '', RULE, 'a', RULE])
})

test("shift+enter makes a new line, as the kitty protocol and modifyOtherKeys send it, and as pi-tui's fallbacks ctrl+j and a backslash before enter do", async () => {
  const { typed } = await chat(20, 8)
  const rows = await typed('a', '\x1b[13;2u', 'b', '\x1b[27;2;13~', 'c', '\n', 'd', '\\', '\r', 'e')
  assert.deepEqual(rows, ['', RULE, 'a', 'b', 'c', 'd', 'e', RULE])
})

test('a paste keeps its new lines in the draft, and is not sent', async () => {
  const { typed } = await chat(20, 6)
  assert.deepEqual(await typed('\x1b[200~one\ntwo\x1b[201~'), ['', '', RULE, 'one', 'two', RULE])
})

async function authored(ctx: Context, author: (plugin: Context) => void) {
  const plugin = ctx.plugin({ name: 'author', inject: ['binnacle'], apply: author })
  await plugin
  return plugin
}

test('a Screen shown over the Chat that focuses no Place gives the composer no key, though it draws it', async () => {
  const { ctx, typed } = await chat()
  const shown = await authored(ctx, (plugin) => {
    plugin.binnacle.show({ name: 'detail', layout: { column: [{ place: 'detail' }, { place: 'composer', size: 'content' }] } })
  })
  const whileShown = await typed('x')
  await shown.dispose()
  assert.deepEqual(
    [whileShown, await typed('y')],
    [
      ['', '', RULE, '', RULE],
      ['', '', RULE, 'y', RULE],
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
  assert.deepEqual(await typed('y'), ['', '', RULE, 'y', RULE])
})
