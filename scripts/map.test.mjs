import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMap, mapOf } from './map.mjs'

const SRC = 'packages/binnacle/src'
const file = (path, text) => ({ path: `${SRC}/${path}`, text })

test('a module maps to its note and what it exports, in source order', () => {
  const files = [
    file('ui/AGENTS.md', '# ui\n\nDraws.\n\n- `gestures.ts` — the one place a gesture gets a meaning.\n'),
    file('ui/gestures.ts', 'export function meaning() {}\nexport const zed = 1\nexport type Alpha = string\nexport interface Beta {}\nexport class Gamma {}\nfunction hidden() {}\n'),
  ]
  assert.deepEqual(mapOf(files), [
    { path: 'ui/gestures.ts', note: 'the one place a gesture gets a meaning.', exports: ['meaning', 'zed', 'Alpha', 'Beta', 'Gamma'], reExports: [], importedBy: [], authorApi: [] },
  ])
})

test('a module maps its re-exports with the module each comes from, relative to src', () => {
  const files = [
    file('ui/node.ts', "export type { AffordanceKind } from '../contract/index.ts'\nexport { a as b, c } from './other.ts'\nexport * from '@earendil-works/pi-tui'\nexport * as ns from './ns.ts'\n"),
    file('contract/index.ts', 'export type AffordanceKind = string\n'),
  ]
  const node = mapOf(files).find(entry => entry.path === 'ui/node.ts')
  assert.deepEqual(node.exports, [])
  assert.deepEqual(node.reExports, [
    { name: 'AffordanceKind', from: 'contract/index.ts' },
    { name: 'b', from: 'ui/other.ts' },
    { name: 'c', from: 'ui/other.ts' },
    { name: '*', from: '@earendil-works/pi-tui' },
    { name: 'ns', from: 'ui/ns.ts' },
  ])
})

test('a module is imported by every module whose relative import or re-export resolves to it, sorted', () => {
  const files = [
    file('ui/node.ts', 'export type Node = string\n'),
    file('views/screen.ts', "import type { Node } from '../ui/node.ts'\n"),
    file('api.ts', "export type { Node } from './ui/node.ts'\n"),
    file('ui/layout.ts', "import { Node } from './node.ts'\nimport x from 'node:path'\n"),
    file('contract/index.ts', 'export type C = string\n'),
    file('ui/answer.ts', "import type { C } from '../contract'\nimport type { Node } from './nodes.ts'\n"),
  ]
  const by = path => mapOf(files).find(entry => entry.path === path).importedBy
  assert.deepEqual(by('ui/node.ts'), ['api.ts', 'ui/layout.ts', 'views/screen.ts'])
  assert.deepEqual(by('contract/index.ts'), ['ui/answer.ts'])
})

test('a module lists which of its names src/api.ts imports or re-exports from it', () => {
  const files = [
    file('api.ts', "import type { Node, Span as S } from './ui/node.ts'\nexport { parseNode } from './ui/node.ts'\nexport type { Kind } from './ui/node.ts'\nexport * from './ui/whole.ts'\nimport { hidden } from './ui/none.ts'\nexport interface Shape { node: Node; span: S }\n"),
    file('ui/node.ts', "export type Span = string\nexport type Node = string\nexport function parseNode() {}\nexport function other() {}\nexport type { Kind } from '../contract/index.ts'\n"),
    file('ui/whole.ts', 'export const a = 1\nexport const b = 2\n'),
    file('ui/none.ts', 'export const shown = 1\n'),
  ]
  const api = path => mapOf(files).find(entry => entry.path === path).authorApi
  assert.deepEqual(api('ui/node.ts'), ['Span', 'Node', 'parseNode', 'Kind'])
  assert.deepEqual(api('ui/whole.ts'), ['a', 'b'])
  assert.deepEqual(api('ui/none.ts'), [])
  assert.deepEqual(api('api.ts'), [])
})

test('a folder limits the map to the modules under it, still showing who outside imports them', () => {
  const files = [
    file('views/screen.ts', "import { a } from '../ui/a.ts'\n"),
    file('ui/b.ts', 'export const b = 1\n'),
    file('ui/a.ts', 'export const a = 1\n'),
    file('ui/deep/c.ts', 'export const c = 1\n'),
    file('uix/d.ts', 'export const d = 1\n'),
  ]
  assert.deepEqual(mapOf(files, 'ui').map(entry => entry.path), ['ui/a.ts', 'ui/b.ts', 'ui/deep/c.ts'])
  assert.deepEqual(mapOf(files, 'ui')[0].importedBy, ['views/screen.ts'])
  assert.deepEqual(mapOf(files).map(entry => entry.path), ['ui/a.ts', 'ui/b.ts', 'ui/deep/c.ts', 'uix/d.ts', 'views/screen.ts'])
})

test('a map is drawn as a line per module with only its non-empty facts beneath', () => {
  const map = [
    { path: 'ui/gestures.ts', note: 'the one place a gesture gets a meaning.', exports: ['meaning'], reExports: [], importedBy: ['ui/answer.ts'], authorApi: [] },
    { path: 'ui/node.ts', note: 'the nodes a view draws with.', exports: ['Span', 'Node'], reExports: [{ name: 'AffordanceKind', from: 'contract/index.ts' }, { name: 'X', from: 'contract/index.ts' }, { name: '*', from: 'pkg' }], importedBy: ['api.ts', 'ui/layout.ts'], authorApi: ['Node'] },
    { path: 'ui/bare.ts', note: '', exports: [], reExports: [], importedBy: [], authorApi: [] },
  ]
  assert.equal(formatMap(map), [
    'ui/gestures.ts — the one place a gesture gets a meaning.',
    '  exports: meaning',
    '  imported by: ui/answer.ts',
    'ui/node.ts — the nodes a view draws with.',
    '  exports: Span, Node',
    '  re-exports: AffordanceKind, X ← contract/index.ts; * ← pkg',
    '  imported by: api.ts, ui/layout.ts',
    '  author API: Node (api.ts)',
    'ui/bare.ts',
    '',
  ].join('\n'))
})

test('an imported name is author API only when api.ts re-exports it or an exported declaration of api.ts mentions it', () => {
  const files = [
    file('api.ts', "import type { KeyId, Hidden, Reg, Alias as A, Unused } from './ui/keys.ts'\nexport interface PlacedScreen { key: KeyId; other: A }\ndeclare module './x.ts' { interface Registrations { r: Reg } }\nfunction helper(h: Hidden) { return h }\n"),
    file('ui/keys.ts', 'export type KeyId = string\nexport type Hidden = string\nexport type Reg = string\nexport type Alias = string\nexport type Unused = string\nexport type Other = string\n'),
  ]
  const keys = mapOf(files).find(entry => entry.path === 'ui/keys.ts')
  assert.deepEqual(keys.authorApi, ['KeyId', 'Reg', 'Alias'])
})

test('a local export list exports the name it exports under', () => {
  const files = [file('ui/list.ts', 'const local = 1\nconst a = 2\nexport { local }\nexport { a as b }\nexport const c = 3\n')]
  assert.deepEqual(mapOf(files)[0].exports, ['local', 'b', 'c'])
})
