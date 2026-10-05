import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mount } from './support/mount.ts'

const PASTE_ON = '\x1b[?2004h'
const PASTE_OFF = '\x1b[?2004l'
const KITTY_ASK = '\x1b[>7u\x1b[?u\x1b[c'
const KITTY_OFF = '\x1b[<u'
const MODIFY_OTHER_KEYS_ON = '\x1b[>4;2m'
const MODIFY_OTHER_KEYS_OFF = '\x1b[>4;0m'

test('binnacle asks for bracketed paste and the kitty keyboard protocol when it takes the terminal, and turns them off when it gives it back', async () => {
  const { terminal, ready, fiber } = await mount()
  ready()
  const taken = terminal.written
  await fiber.dispose()
  const givenBack = terminal.written.slice(taken.length)
  assert.deepEqual(
    [taken.includes(PASTE_ON), taken.includes(KITTY_ASK), givenBack.includes(PASTE_OFF), givenBack.includes(KITTY_OFF)],
    [true, true, true, true],
  )
})

test("a terminal that answers with no kitty flags is asked for modifyOtherKeys, pi-tui's fallback, which goes with the terminal", async () => {
  const { terminal, ready, fiber } = await mount()
  ready()
  terminal.type('\x1b[?62;22c')
  const answered = terminal.written
  await fiber.dispose()
  assert.deepEqual(
    [answered.includes(MODIFY_OTHER_KEYS_ON), terminal.written.slice(answered.length).includes(MODIFY_OTHER_KEYS_OFF)],
    [true, true],
  )
})

test('a terminal that answers with its kitty flags is not asked for modifyOtherKeys', async () => {
  const { terminal, ready } = await mount()
  ready()
  terminal.type('\x1b[?7u')
  terminal.type('\x1b[?62;22c')
  assert.equal(terminal.written.includes(MODIFY_OTHER_KEYS_ON), false)
})
