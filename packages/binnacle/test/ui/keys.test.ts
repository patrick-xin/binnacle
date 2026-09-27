import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Keybindings } from '@earendil-works/pi-tui'
import { keyTable } from '../../src/ui/keys.ts'

/** The one key table. */
const { resolve } = keyTable()

test('the host\'s two keys resolve from their legacy bytes, whatever has focus', () => {
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

test('with nothing focused, only step in is answered: shift+tab; tab, up, down, enter and escape reach the composer', () => {
  assert.deepEqual(resolve('\x1b[Z', false), { kind: 'gesture', binding: 'focus.previous' })
  assert.deepEqual(resolve('\t', false), undefined)
  assert.deepEqual(resolve('\x1b[A', false), undefined)
  assert.deepEqual(resolve('\x1b[B', false), undefined)
  assert.deepEqual(resolve('\r', false), undefined)
  assert.deepEqual(resolve('\x1b', false), undefined)
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

test('while a placed screen is open, escape and the key that opened it return, the scroll keys read the screen, and quit still answers', () => {
  const table = keyTable()
  table.offer('trajectory', { defaultKeys: 'f2', description: 'open the trajectory' })
  assert.deepEqual(table.resolve('\x1bOQ', false, true), { kind: 'screen', name: 'trajectory' }, 'the same key returns')
  assert.deepEqual(table.resolve('\x1b', false, true), { kind: 'screen-close' })
  assert.deepEqual(table.resolve('\x1b', true, true), { kind: 'screen-close' }, 'whatever had focus')
  assert.deepEqual(table.resolve('\x1b[5~', false, true), { kind: 'screen-scroll', scroll: 'page.up' })
  assert.deepEqual(table.resolve('\x1b[6~', false, true), { kind: 'screen-scroll', scroll: 'page.down' })
  assert.deepEqual(table.resolve('\x1b[F', false, true), { kind: 'screen-scroll', scroll: 'end' })
  assert.deepEqual(table.resolve('\x03', false, true), { kind: 'quit' })
  assert.deepEqual(table.resolve('\x14', false, true), { kind: 'switch-screens' })
  assert.deepEqual(table.resolve('\t', true, true), undefined, 'focus does not move on the transcript under a placed screen')
  assert.deepEqual(table.resolve('\x1b[Z', false, true), undefined, 'the composer under it is not typed into')
})
