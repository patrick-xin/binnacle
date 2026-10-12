import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')

// The rules that fire on one file, linted with the plugin and the given rules only.
const fired = (source, rules) => {
  const dir = mkdtempSync(join(tmpdir(), 'anti-slop-'))
  const config = { jsPlugins: [{ name: 'anti-slop', specifier: join(root, 'tools/oxlint/anti-slop/index.ts') }], rules }
  writeFileSync(join(dir, '.oxlintrc.json'), JSON.stringify(config))
  writeFileSync(join(dir, 'file.ts'), source)
  const run = spawnSync(join(root, 'node_modules/.bin/oxlint'), ['-c', join(dir, '.oxlintrc.json'), '-f', 'json', 'file.ts'], {
    cwd: dir,
    encoding: 'utf8',
  })
  return JSON.parse(run.stdout).diagnostics.map((diagnostic) => diagnostic.code)
}

const COMMENTED = { 'anti-slop/require-comment-for-type-assertion': 'error' }

test('a type assertion with no comment is reported', () => {
  assert.deepEqual(fired('export const n = JSON.parse("1") as number\n', COMMENTED), ['anti-slop(require-comment-for-type-assertion)'])
})

test('a comment above a one-line `if` covers the assertion in its statement', () => {
  const source = 'export function f(x: unknown) {\n  // Says why.\n  if (x) return x as number\n  return 0\n}\n'
  assert.deepEqual(fired(source, COMMENTED), [])
})

test('an assertion through unknown is reported', () => {
  const source = 'export const n = "1" as unknown as number\n'
  assert.deepEqual(fired(source, { 'anti-slop/no-chained-type-assertions': 'error' }), ['anti-slop(no-chained-type-assertions)'])
})

test('a const assertion needs no comment', () => {
  assert.deepEqual(fired('export const n = [1] as const\n', COMMENTED), [])
})
