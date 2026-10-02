import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPatch, patchFilesOf } from './check-patch.mjs'

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

test('a bundle that names one patch file declares that file alone', () => {
  assert.deepEqual(patchFilesOf({ dsh: { bundle: { patch: './cordis.patch.yml' } } }), ['./cordis.patch.yml'])
})

test('a bundle that lists patch files declares them in order', () => {
  assert.deepEqual(
    patchFilesOf({ dsh: { bundle: { patch: ['./cordis.patch.yml', './presets/standard.patch.yml', './presets/author.patch.yml'] } } }),
    ['./cordis.patch.yml', './presets/standard.patch.yml', './presets/author.patch.yml'],
  )
})

test('a bundle that declares no patch declares no file', () => {
  assert.deepEqual(patchFilesOf({}), [])
  assert.deepEqual(patchFilesOf({ dsh: {} }), [])
})

test('a bundle that declares no patch is refused, as the loader refuses it', () => {
  assert.throws(() => patchFilesOf({ dsh: { bundle: {} } }), /dsh.bundle.patch must be a file path or a list of file paths/)
})

test('a patch declared as anything but a path or a list of paths is refused, as the loader refuses it', () => {
  assert.throws(() => patchFilesOf({ dsh: { bundle: { patch: 4 } } }), /dsh.bundle.patch must be a file path or a list of file paths/)
  assert.throws(
    () => patchFilesOf({ dsh: { bundle: { patch: ['./cordis.patch.yml', 4] } } }),
    /dsh.bundle.patch must be a file path or a list of file paths/,
  )
})
