/**
 * The built bundle, loaded the way a dsh profile loads it: `dist/index.js`
 * under plain `node`, with no test compiler between. A packaging fault — a
 * default export that collapses the module, an entry the manifest does not
 * point at, a patch the manifest does not ship — shows here and nowhere else.
 * @module binnacle/test/artifact
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('the manifest points dsh at the patch it ships, and the patch inserts the row by the package name', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, new RegExp(`name: '${manifest.name}'`))
})

test('the patch loads dsh\'s ask-user tool, whose questions the built-in Questions plugin answers', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /name: '@deepseek-ai\/dsh-tool-ask-user'/)
})

test('plain node loads the built entry as a Cordis row, with no default export and no test hook', () => {
  const probe = `const m = await import('./dist/index.js'); console.log(JSON.stringify({ keys: Object.keys(m).sort(), name: m.name, inject: m.inject, apply: typeof m.apply }))`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: packageDir, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), {
    keys: ['apply', 'inject', 'name'],
    name: 'binnacle',
    inject: ['cmdlineArgs', 'agents', 'agentDefaultModel', 'commands'],
    apply: 'function',
  })
})
