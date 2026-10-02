/**
 * The built bundle, loaded the way a dsh profile loads it: `dist/index.js`
 * under plain `node`, with no test compiler between. A packaging fault — a
 * default export that collapses the module, an entry the manifest does not
 * point at, a patch the manifest does not ship — shows here and nowhere else.
 * @module binnacle/test/artifact
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('the manifest points dsh at the patch files it ships, and the patch inserts the row by the package name', () => {
  assert.deepEqual(manifest.dsh.bundle.patch, [
    './cordis.patch.yml',
    './presets/standard.patch.yml',
    './presets/ptc.patch.yml',
    './presets/minimal.patch.yml',
    './presets/cordis.patch.yml',
    './presets/author.patch.yml',
  ])
  for (const file of manifest.dsh.bundle.patch) {
    const shipped = file.replace(/^\.\//, '')
    assert.ok(manifest.files.includes(shipped), `${shipped} ships with the package`)
    assert.ok(existsSync(new URL(`../${shipped}`, import.meta.url)), `${shipped} is in the package`)
  }
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, new RegExp(`name: '${manifest.name}'`))
  assert.ok(manifest.files.includes('theme.schema.json'), 'the schema a theme file is checked against ships with the package')
  assert.ok(manifest.files.includes('skills'), 'the author skill ships with the package')
  assert.ok(existsSync(new URL('../skills/binnacle-author/SKILL.md', import.meta.url)), 'the skill is where the author preset looks')
})

test("the presets compose dsh's ask-user tool, whose questions the built-in Questions plugin answers", () => {
  for (const preset of ['standard', 'author']) {
    const patch = readFileSync(new URL(`../presets/${preset}.patch.yml`, import.meta.url), 'utf8')
    assert.match(patch, /name: '@deepseek-ai\/dsh-tool-ask-user'/, preset)
  }
})

test('plain node loads the built entry as a Cordis row, with no default export and no test hook', () => {
  const probe = `const m = await import('./dist/index.js'); console.log(JSON.stringify({ keys: Object.keys(m).sort(), name: m.name, inject: m.inject, apply: typeof m.apply }))`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: packageDir, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), {
    keys: ['apply', 'inject', 'name'],
    name: 'binnacle',
    inject: ['cmdlineArgs', 'agents', 'agentDefaultModel', 'agentPresets', 'commands'],
    apply: 'function',
  })
})

/** The built-in features the patch loads as rows of their own, in the order it inserts them. */
const FEATURES = ['transcript', 'composer', 'status-line', 'tool-cards', 'trajectory', 'theme']

test("plain node loads each built-in feature's subpath, as the manifest exports it, as a Cordis row with no default export", () => {
  for (const feature of FEATURES) {
    const probe = `const m = await import('${manifest.name}/plugins/${feature}'); console.log(JSON.stringify({ keys: Object.keys(m).sort(), apply: typeof m.apply }))`
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: packageDir, encoding: 'utf8' })
    assert.equal(run.status, 0, `${feature}: ${run.stderr}`)
    assert.deepEqual(JSON.parse(run.stdout), { keys: ['apply', 'inject', 'name'], apply: 'function' }, feature)
    assert.deepEqual(
      manifest.exports[`./plugins/${feature}`],
      { types: `./dist/plugins/${feature}/index.d.ts`, default: `./dist/plugins/${feature}/index.js` },
      feature,
    )
  }
})

test("the patch inserts a row for each built-in feature after binnacle's own, by an id a person disables it by, in order", () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const rows = [...patch.matchAll(/- id: (\S+)\n\s+name: '([^']+)'/g)].map(([, id, name]) => ({ id, name }))
  const own = rows.findIndex((row) => row.name === manifest.name)
  assert.deepEqual(rows.slice(own, own + 1 + FEATURES.length), [
    { id: 'binnacle', name: 'binnacle' },
    { id: 'binnacle-transcript', name: 'binnacle/plugins/transcript' },
    { id: 'binnacle-composer', name: 'binnacle/plugins/composer' },
    { id: 'binnacle-status-line', name: 'binnacle/plugins/status-line' },
    { id: 'binnacle-tool-cards', name: 'binnacle/plugins/tool-cards' },
    { id: 'binnacle-trajectory', name: 'binnacle/plugins/trajectory' },
    { id: 'binnacle-theme', name: 'binnacle/plugins/theme' },
  ])
})
