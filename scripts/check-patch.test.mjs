import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPatch } from './check-patch.mjs'

const BASE = {
  name: 'dsh-base',
  text: '- insert:\n    - id: hmr\n      name: hmr\n    - id: agents\n      name: group\n      group: true\n      config:\n        - id: agent\n          name: agent\n',
}

test('a patch whose every row lands on the layers below passes', () => {
  const ours = {
    name: 'binnacle',
    text: '- id: hmr\n  disabled: true\n- id: agent\n  config: {}\n- insert:\n    - id: binnacle\n      name: binnacle\n',
  }
  assert.deepEqual(checkPatch([BASE, ours]), [])
})

test('a row no layer below composes is named, since dsh only warns and boots without it', () => {
  const ours = { name: 'binnacle', text: '- id: reloader\n  disabled: true\n' }
  assert.deepEqual(checkPatch([BASE, ours]), ["binnacle: patch: entry 'reloader' not found"])
})

test("a row patched under another plugin's name is named", () => {
  const ours = { name: 'binnacle', text: '- id: hmr\n  name: timer\n  disabled: true\n' }
  assert.deepEqual(checkPatch([BASE, ours]), ["binnacle: patch: name mismatch for 'hmr' (expected 'hmr', got 'timer'), skipping"])
})

test('an insert into a row that is not a group is named', () => {
  const ours = { name: 'binnacle', text: '- id: hmr\n  insert:\n    - id: binnacle\n      name: binnacle\n' }
  assert.deepEqual(checkPatch([BASE, ours]), ["binnacle: patch insert: entry 'hmr' is not a group"])
})
