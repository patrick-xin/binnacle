import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { kinds } from '../../src/facts/kinds.ts'

test('every kind dsh knows is named in the table, as read, quiet or unread; one that is not names it', () => {
  assert.deepEqual(
    [...KNOWN_SESSION_EVENT_TYPES].filter((type) => !Object.hasOwn(kinds, type)),
    [],
  )
})

test('the table names no kind dsh does not know, so a pin that drops one drops it here too', () => {
  assert.deepEqual(
    Object.keys(kinds).filter((type) => !KNOWN_SESSION_EVENT_TYPES.has(type)),
    [],
  )
})
