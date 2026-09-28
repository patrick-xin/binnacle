import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPlaceholders } from './check-placeholders.mjs'

// Built from parts so this file holds none of the placeholders it tests.
const placeholder = (kind) => ['[', 'REDACTED', ':', kind, ']'].join('')

test('a placeholder a privacy tool put where a value stood is found, by file and line', () => {
  const text = `see\nhttps://github.com/${placeholder('pii')}/binnacle/issues/32`
  assert.deepEqual(findPlaceholders([{ path: 'a.md', text }]), [
    { path: 'a.md', line: 2, found: placeholder('pii') },
  ])
})
