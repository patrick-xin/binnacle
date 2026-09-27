import { test } from 'node:test'
import assert from 'node:assert/strict'
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
