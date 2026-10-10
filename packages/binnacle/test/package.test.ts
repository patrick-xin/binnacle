import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const kept = ['toPlainText', 'visibleWidth', 'truncateToWidth', 'createModel', 'list', 'line', 'tabs', 'title', 'CHAT_LAYOUT']

let into: string
let files: string[]
let unpacked: string

before(() => {
  // Under the package's own node_modules, so that the unpacked dist resolves its dependencies as an installed one does.
  into = mkdtempSync(join(root, 'node_modules', '.packed-'))
  execFileSync('pnpm', ['pack', '--pack-destination', into], { cwd: root, stdio: 'ignore' })
  const tarball = join(
    into,
    readdirSync(into).find((name) => name.endsWith('.tgz'))!,
  )
  files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '')
    .map((path) => path.replace(/^package\//, ''))
  execFileSync('tar', ['-xzf', tarball, '-C', into])
  unpacked = join(into, 'package')
})

after(() => rmSync(into, { recursive: true, force: true }))

const read = (path: string) => readFileSync(join(unpacked, path), 'utf8')

test("the packed package holds AUTHORING.md and the built-ins' source", () => {
  const plugins = Object.keys(JSON.parse(read('package.json')).exports as object)
    .filter((path) => path.startsWith('./plugins/'))
    .map((path) => `src${path.slice(1)}/index.ts`)
  const wanted = ['AUTHORING.md', 'src/index.ts', 'src/api.ts', 'src/kit/list.ts', 'dist/index.js', 'dist/index.d.ts', ...plugins]
  assert.ok(plugins.length > 0)
  assert.deepEqual(
    wanted.filter((path) => !files.includes(path)),
    [],
  )
})

test("the packed export map gives what the Kit keeps, and not pi-tui's Input", async () => {
  const exports = JSON.parse(read('package.json')).exports as Record<string, { default: string }>
  const index = await import(pathToFileURL(join(unpacked, exports['.']!.default)).href)
  assert.deepEqual(
    kept.filter((name) => !(name in index)),
    [],
  )
  assert.deepEqual(
    ['Input', 'CURSOR_MARKER'].filter((name) => name in index),
    [],
  )
})

test("the packed Requests' view gives what an author builds on, and AUTHORING.md names each", async () => {
  const exports = JSON.parse(read('package.json')).exports as Record<string, { default: string }>
  const view = await import(pathToFileURL(join(unpacked, exports['./plugins/requests-view']!.default)).href)
  const built = ['REQUEST_LAYOUT', 'titleOf', 'itemsOf', 'pick', 'advance', 'keyOf']
  assert.deepEqual(
    built.filter((name) => !(name in view) || !read('AUTHORING.md').includes(name)),
    [],
  )
})

test('the packed status line gives `STATUS_LAYOUT` to build on, and AUTHORING.md names it', async () => {
  const exports = JSON.parse(read('package.json')).exports as Record<string, { default: string }>
  const statusLine = await import(pathToFileURL(join(unpacked, exports['./plugins/status-line']!.default)).href)
  assert.deepEqual(
    [statusLine.STATUS_LAYOUT, read('AUTHORING.md').includes('STATUS_LAYOUT')],
    [{ row: [{ place: 'status.state' }, { place: 'status.model' }], separator: true }, true],
  )
})

test('the packed AUTHORING.md names every member of the author API, every export, every Tone, and how to load a plugin in a profile', () => {
  const guide = read('AUTHORING.md')
  const api = read('dist/api.d.ts')
  const binnacle = api.slice(api.indexOf('export interface Binnacle {'))
  const members = [...binnacle.slice(0, binnacle.indexOf('\n}')).matchAll(/^ {4}(?:readonly )?(\w+)[<(:]/gm)].map(
    ([, name]) => `binnacle.${name}`,
  )
  const tones = [...api.match(/export type Tone = ([^;]+);/)![1]!.matchAll(/'(\w+)'/g)].map(([, tone]) => tone!)
  const wanted = [
    ...members,
    ...kept.map((name) => (/^[a-z]/.test(name) ? `${name}(` : name)),
    ...tones.map((tone) => `\`${tone}\``),
    'cordis.patch.yml',
    'dsh --profile',
  ]
  assert.ok(members.length > 10)
  assert.deepEqual(
    wanted.filter((name) => !guide.includes(name)),
    [],
  )
})
