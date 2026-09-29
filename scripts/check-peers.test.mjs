import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPeers } from './check-peers.mjs'

const manifest = (fields = {}) => ({ name: 'binnacle', ...fields })
const check = ({ files = [], patch = '', ...fields } = {}) => checkPeers({ manifest: manifest(fields), files, patch })

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

const PATCH = "- id: hmr\n  disabled: true\n- insert:\n    - id: binnacle\n      name: 'binnacle'\n    - id: ask\n      name: '@deepseek-ai/dsh-tool-ask-user'\n"

test('a row the patch inserts is a peerDependency, and makes one needed', () => {
  assert.deepEqual(check({ patch: PATCH, peerDependencies: { '@deepseek-ai/dsh-tool-ask-user': '1' } }), [])
  assert.deepEqual(check({ patch: PATCH, devDependencies: { '@deepseek-ai/dsh-tool-ask-user': '1' } }), [
    "@deepseek-ai/dsh-tool-ask-user is a row binnacle's patch inserts, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it",
  ])
})

test('problems come in a stable order, sorted, however the files and lists are ordered', () => {
  const files = [{ path: 'src/b.ts', text: "import 'z'\nimport 'a'\n" }]
  assert.deepEqual(check({ files }).map(line => line.split(' ')[0]), ['a', 'z'])
})
