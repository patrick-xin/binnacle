import { test } from 'node:test'
import assert from 'node:assert/strict'
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
