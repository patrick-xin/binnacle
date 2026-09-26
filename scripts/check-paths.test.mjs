import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findLeaks } from './check-paths.mjs'

// Built from parts so this file holds none of the paths it tests.
const path = (...parts) => parts.join('/')

test('an absolute macOS home path is a leak', () => {
  const text = `read with git -C ${path('', 'Users', 'someone', 'dev', 'thing')} show`
  assert.deepEqual(findLeaks([{ path: 'a.md', text }]), [
    { path: 'a.md', line: 1, found: path('', 'Users', 'someone', '') },
  ])
})

test('a Linux home and a Windows profile are leaks', () => {
  const text = [path('', 'home', 'someone', 'x'), 'C:\\Users\\someone\\x'].join('\n')
  assert.deepEqual(findLeaks([{ path: 'b.md', text }]).map(leak => leak.line), [1, 2])
})

test('a home-relative path into a person\'s own layout is a leak', () => {
  const text = `see \`${path('~', 'dev', 'github', 'pi')}\``
  assert.deepEqual(findLeaks([{ path: 'c.ts', text }]), [
    { path: 'c.ts', line: 1, found: path('~', 'd') },
  ])
})

test('a tool\'s own dot-directory under home is not a leak', () => {
  const text = `profiles live in \`${path('~', '.dsh', 'profiles')}\` and \`${path('~', '.config')}\``
  assert.deepEqual(findLeaks([{ path: 'd.md', text }]), [])
})

test('a path that only resembles a home is not a leak', () => {
  const text = 'the route /api/users/42 and a /usr/local/bin'
  assert.deepEqual(findLeaks([{ path: 'e.md', text }]), [])
})
