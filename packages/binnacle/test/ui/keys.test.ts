import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Keybindings } from '@earendil-works/pi-tui'
import { keyTable } from '../../src/ui/keys.ts'

/** The one key table. */
const { resolve } = keyTable()

test("the host's two keys resolve from their legacy bytes, whatever has focus", () => {
  assert.deepEqual(resolve('\x03', false), { kind: 'quit' })
  assert.deepEqual(resolve('\x14', true), { kind: 'switch-screens' })
})

test('where the terminal reports holding and releasing a key, as a kitty-protocol one does, only the press resolves', () => {
  assert.deepEqual(resolve('\x1b[116;5u', false), { kind: 'switch-screens' })
  assert.deepEqual(resolve('\x1b[116;5:2u', false), undefined)
  assert.deepEqual(resolve('\x1b[116;5:3u', false), undefined)
  assert.deepEqual(resolve('\x1b[99;5u', true), { kind: 'quit' })
  assert.deepEqual(resolve('\x1b[99;5:2u', true), undefined)
  assert.deepEqual(resolve('\x1b[99;5:3u', true), undefined)
})

test("with nothing focused, step in is answered, shift+tab, and escape is the host's to interrupt with; tab, up, down and enter reach the composer", () => {
  assert.deepEqual(resolve('\x1b[Z', false), { kind: 'gesture', binding: 'focus.previous' })
  assert.deepEqual(resolve('\t', false), undefined)
  assert.deepEqual(resolve('\x1b[A', false), undefined)
  assert.deepEqual(resolve('\x1b[B', false), undefined)
  assert.deepEqual(resolve('\r', false), undefined)
  assert.deepEqual(resolve('\x1b', false), { kind: 'interrupt' })
})

test('while something has focus, tab and down move to the next, up and shift+tab to the previous, enter is primary, escape steps out', () => {
  assert.deepEqual(resolve('\t', true), { kind: 'gesture', binding: 'focus.next' })
  assert.deepEqual(resolve('\x1b[B', true), { kind: 'gesture', binding: 'focus.next' })
  assert.deepEqual(resolve('\x1b[A', true), { kind: 'gesture', binding: 'focus.previous' })
  assert.deepEqual(resolve('\x1b[Z', true), { kind: 'gesture', binding: 'focus.previous' })
  assert.deepEqual(resolve('\r', true), { kind: 'gesture', binding: 'primary' })
  assert.deepEqual(resolve('\x1b[13u', true), { kind: 'gesture', binding: 'primary' })
  assert.deepEqual(resolve('\x1b', true), { kind: 'gesture', binding: 'focus.out' })
})

test('a key binnacle does not bind resolves to nothing, whatever has focus', () => {
  for (const focused of [false, true]) {
    assert.deepEqual(resolve('x', focused), undefined)
    assert.deepEqual(resolve('\x7f', focused), undefined)
    assert.deepEqual(resolve('\x1b[13;2u', focused), undefined)
  }
})

test('a key a plugin offers resolves to the screen it opens, and withdrawing the offer stops it resolving', () => {
  const table = keyTable()
  const withdraw = table.offer('trajectory', { defaultKeys: 'f2', description: 'open the trajectory' })
  assert.deepEqual(table.resolve('\x1bOQ', false), { kind: 'screen', name: 'trajectory' })
  assert.equal(table.manager.getDefinition('binnacle.screen.trajectory' as keyof Keybindings)?.description, 'open the trajectory')
  withdraw()
  assert.deepEqual(table.resolve('\x1bOQ', false), undefined)
  assert.equal(table.manager.getDefinition('binnacle.screen.trajectory' as keyof Keybindings), undefined)
})

test("while a placed screen is open it takes the transcript's keys: shift+tab steps in, and with it focused tab, up, down and enter are gestures; escape returns, quit still answers, and with nothing focused typing reaches the composer", () => {
  const table = keyTable()
  table.offer('trajectory', { defaultKeys: 'f2', description: 'open the trajectory' })
  assert.deepEqual(table.resolve('\x1bOQ', false, true), { kind: 'screen', name: 'trajectory' }, 'the same key returns')
  assert.deepEqual(table.resolve('\x03', false, true), { kind: 'quit' })
  assert.deepEqual(table.resolve('\x14', false, true), { kind: 'switch-screens' })
  assert.deepEqual(table.resolve('\x1b[Z', false, true), { kind: 'gesture', binding: 'focus.previous' }, 'step in reaches the screen')
  for (const focused of [false, true]) {
    assert.deepEqual(table.resolve('\x1b', focused, true), { kind: 'screen-close' }, 'escape returns, whatever had focus')
  }
  assert.deepEqual(table.resolve('\t', false, true), undefined, 'with nothing focused, typing reaches the composer')
  assert.deepEqual(table.resolve('\r', false, true), undefined)
  assert.deepEqual(
    table.resolve('\t', true, true),
    { kind: 'gesture', binding: 'focus.next' },
    'with the screen focused, its regions take the keys',
  )
  assert.deepEqual(table.resolve('\x1b[B', true, true), { kind: 'gesture', binding: 'focus.next' })
  assert.deepEqual(table.resolve('\x1b[A', true, true), { kind: 'gesture', binding: 'focus.previous' })
  assert.deepEqual(table.resolve('\r', true, true), { kind: 'gesture', binding: 'primary' })
})

test('a key a person rebinds resolves as they bound it, and the key it had resolves to nothing', () => {
  const table = keyTable()
  table.bind({ 'binnacle.quit': 'ctrl+q' })
  assert.deepEqual(table.resolve('\x11', false), { kind: 'quit' })
  assert.deepEqual(table.resolve('\x03', false), undefined)
})

test('a key bound to what content offers resolves to that affordance while something has focus, and reaches the composer while nothing has', () => {
  const table = keyTable()
  table.bind({ 'binnacle.copy': 'ctrl+y' })
  assert.deepEqual(table.resolve('\x19', true), { kind: 'gesture', binding: 'copy' })
  assert.deepEqual(table.resolve('\x19', false), undefined)
})

test('a binding a person set resolves as they bound it where a default shares its key: copy on enter wins over primary', () => {
  const table = keyTable()
  table.bind({ 'binnacle.copy': 'enter' })
  assert.deepEqual(table.resolve('\r', true), { kind: 'gesture', binding: 'copy' })
  assert.deepEqual(table.resolve('\r', false), undefined, 'with nothing focused, copy is not live and enter reaches the composer')
})

test('the table names the keys that give a gesture each meaning, as a person bound them', () => {
  const table = keyTable()
  assert.deepEqual(table.keysOf('primary'), ['enter'])
  assert.deepEqual(table.keysOf('focus.next'), ['tab', 'down'])
  assert.deepEqual(table.keysOf('grant'), [])
  table.bind({ 'binnacle.grant': 'y', 'binnacle.primary': ['enter', 'space'] })
  assert.deepEqual(table.keysOf('grant'), ['y'])
  assert.deepEqual(table.keysOf('primary'), ['enter', 'space'])
})

test("while something has focus the shift arrows page an ask's prose, and while a seat offers PageUp/PageDown jump its window; otherwise both reach the viewport", () => {
  assert.deepEqual(resolve('\x1b[1;2A', true), { kind: 'gesture', binding: 'page.previous' })
  assert.deepEqual(resolve('\x1b[1;2B', true), { kind: 'gesture', binding: 'page.next' })
  for (const focused of [false, true]) {
    assert.deepEqual(resolve('\x1b[5~', focused, false, true), { kind: 'gesture', binding: 'jump.previous' })
    assert.deepEqual(resolve('\x1b[6~', focused, false, true), { kind: 'gesture', binding: 'jump.next' })
    assert.deepEqual(resolve('\x1b[5~', focused), undefined)
    assert.deepEqual(resolve('\x1b[6~', focused), undefined)
  }
  // And with nothing focused, while a seat offers: an ask of prose alone is paged by them.
  assert.deepEqual(resolve('\x1b[1;2A', false, false, true), { kind: 'gesture', binding: 'page.previous' })
  assert.deepEqual(resolve('\x1b[1;2B', false, false, true), { kind: 'gesture', binding: 'page.next' })
  for (const data of ['\x1b[1;2A', '\x1b[1;2B']) assert.deepEqual(resolve(data, false), undefined)
})

test('the table names the keys bound to paging, and a person may rebind them', () => {
  const table = keyTable()
  assert.deepEqual(table.keysOf('page.next'), ['shift+down'])
  table.bind({ 'binnacle.ask.pageDown': 'ctrl+d' })
  assert.deepEqual(table.keysOf('page.next'), ['ctrl+d'])
  assert.deepEqual(table.resolve('\x04', true), { kind: 'gesture', binding: 'page.next' })
})
