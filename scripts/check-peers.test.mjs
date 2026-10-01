import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkPeers, servicesProvidedBy } from './check-peers.mjs'

const manifest = (fields = {}) => ({ name: 'binnacle', ...fields })
const check = ({ files = [], patch = '', services, provided, ...fields } = {}) =>
  checkPeers({ manifest: manifest(fields), files, patch, services, provided })

test('a package whose code is imported, declared nowhere, is named with its file', () => {
  const files = [{ path: 'src/a.ts', text: "import { x } from '@deepseek-ai/dsh-session/surface'\n" }]
  assert.deepEqual(check({ files, devDependencies: { '@deepseek-ai/dsh-session': '1' } }), [
    '@deepseek-ai/dsh-session is imported by src/a.ts and its code runs, but it is in neither dependencies nor peerDependencies — move it to peerDependencies if the dsh install provides it, or to dependencies to bundle it',
  ])
})

test('imports that run no code (type-only forms, relative, node: and binnacle itself) need no declaration', () => {
  const text = [
    "import type { A } from 'a'",
    "import { type B, type C } from 'b'",
    "export type { D } from 'd'",
    "import './e.ts'",
    "import { f } from 'node:fs'",
    "import { g } from 'binnacle/api'",
  ].join('\n')
  assert.deepEqual(check({ files: [{ path: 'src/a.ts', text }], devDependencies: { a: '1', b: '1', d: '1' } }), [])
})

test('a package imported for its types only, declared nowhere, is named with what to add', () => {
  const files = [{ path: 'src/a.ts', text: "import type { A } from '@scope/a/deep'\n" }]
  assert.deepEqual(check({ files }), [
    '@scope/a is imported by src/a.ts for its types only, but is in none of devDependencies, dependencies and peerDependencies — add it to devDependencies',
  ])
})

test('a peerDependency binnacle runs no code of, and inserts no row of, is told to move to devDependencies', () => {
  const files = [{ path: 'src/a.ts', text: "import type { A } from '@deepseek-ai/dsh-commands'\nimport { b } from 'b'\n" }]
  assert.deepEqual(check({ files, peerDependencies: { '@deepseek-ai/dsh-commands': '1', b: '1' } }), [
    '@deepseek-ai/dsh-commands is a peerDependency, but binnacle runs none of its code and its patch inserts no row of it — move it to devDependencies, where a package whose types alone are read belongs',
  ])
})

const PATCH =
  "- id: hmr\n  disabled: true\n- insert:\n    - id: binnacle\n      name: 'binnacle'\n    - id: ask\n      name: '@deepseek-ai/dsh-tool-ask-user'\n"

test('a row the patch inserts is a peerDependency, and makes one needed', () => {
  assert.deepEqual(check({ patch: PATCH, peerDependencies: { '@deepseek-ai/dsh-tool-ask-user': '1' } }), [])
  assert.deepEqual(check({ patch: PATCH, devDependencies: { '@deepseek-ai/dsh-tool-ask-user': '1' } }), [
    "@deepseek-ai/dsh-tool-ask-user is a row binnacle's patch inserts, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it",
  ])
})

test("a row naming a subpath of binnacle is binnacle's own, and a row naming another package's subpath needs that package", () => {
  const patch =
    "- insert:\n    - id: binnacle-status-line\n      name: 'binnacle/plugins/status-line'\n    - id: deep\n      name: '@scope/a/deep'\n"
  assert.deepEqual(check({ patch, peerDependencies: { '@scope/a': '1' } }), [])
})

test('problems come in a stable order, sorted, however the files and lists are ordered', () => {
  const files = [{ path: 'src/b.ts', text: "import 'z'\nimport 'a'\n" }]
  assert.deepEqual(
    check({ files }).map((line) => line.split(' ')[0]),
    ['a', 'z'],
  )
})

const INJECT = "export const inject = ['binnacle', 'tools'] satisfies (keyof Context)[]\n"
const injecting = { path: 'src/plugins/tool-cards/index.ts', text: INJECT }

test('a service an inject names, with no row in the services table, is told to name its provider there', () => {
  assert.deepEqual(check({ files: [injecting] }), [
    "tools is named by src/plugins/tool-cards/index.ts's inject, but the services table in layers.json has no row for it — name the package that provides it there",
  ])
})

const provides = (table) => (name) => (table[name] === undefined ? undefined : new Set(table[name]))
const withServices = (fields = {}) =>
  check({ files: [injecting], services: { tools: '@scope/tools' }, provided: provides({ '@scope/tools': ['tools'] }), ...fields })

test('a provider of a service an inject names is a peerDependency, told with the service and the module', () => {
  assert.deepEqual(withServices({ devDependencies: { '@scope/tools': '1' } }), [
    "@scope/tools provides tools, which src/plugins/tool-cards/index.ts's inject names, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it",
  ])
  assert.deepEqual(withServices({ peerDependencies: { '@scope/tools': '1' } }), [])
})

test('a services row naming a package whose types do not augment Context with the service is refused', () => {
  const peerDependencies = { '@scope/tools': '1' }
  assert.deepEqual(withServices({ peerDependencies, provided: provides({ '@scope/tools': ['other'] }) }), [
    '@scope/tools is named in the services table of layers.json as the provider of tools, but its types do not declare tools on Context — name the package that does',
  ])
  assert.deepEqual(withServices({ peerDependencies, provided: provides({}) }), [
    '@scope/tools is named in the services table of layers.json as the provider of tools, but it is not installed to read — add it to devDependencies',
  ])
})

test('a services row no module names is held to upstream too', () => {
  assert.deepEqual(check({ services: { ghost: '@scope/a' }, provided: provides({ '@scope/a': [] }) }), [
    '@scope/a is named in the services table of layers.json as the provider of ghost, but its types do not declare ghost on Context — name the package that does',
  ])
})

const install = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-peers-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  return dir
}

test('the services a package provides are the Context members its types, and the files they reach, declare', () => {
  const dir = install({
    'package.json': JSON.stringify({ name: 'p', exports: { '.': { types: './lib/index.d.ts' } } }),
    'lib/index.d.ts': [
      "import type { Sub } from './sub.ts'",
      "export * from './more.ts'",
      "declare module '@deepseek-ai/cordis' {",
      '  interface Context { agents: Sub; agentDefaultModel?: Sub }',
      '  interface Events { notAService: Sub }',
      '}',
      "declare module 'elsewhere' { interface Context { notThisEither: 1 } }",
      'interface Context { notInAModule: 1 }',
    ].join('\n'),
    'lib/more.d.ts': "declare module '@deepseek-ai/cordis' { interface Context { tools: 1 } }",
    'lib/sub.d.ts': "export type Sub = 1\ndeclare module '@deepseek-ai/cordis' { interface Context { fromSub: 1 } }",
    'lib/unreached.d.ts': "declare module '@deepseek-ai/cordis' { interface Context { unreached: 1 } }",
  })
  assert.deepEqual([...servicesProvidedBy(dir)].toSorted(), ['agentDefaultModel', 'agents', 'fromSub', 'tools'])
})
