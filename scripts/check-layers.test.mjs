import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLayers } from './check-layers.mjs'

const RULES = {
  root: 'src',
  entry: ['host'],
  layers: { contract: [], facts: ['contract'], ui: ['contract'], host: ['contract', 'facts', 'ui'] },
  external: { '@earendil-works/pi-tui': ['ui', 'host'], '@deepseek-ai/dsh-session': ['facts'], '@deepseek-ai/dsh-cmdline': ['host'], 'node:': ['host'] },
}
const file = (path, ...imports) => ({ path, text: imports.map(spec => `import type {} from '${spec}'`).join('\n') })

test('a layer may import the layers it is allowed', () => {
  assert.deepEqual(checkLayers([file('src/facts/log.ts', '../contract/index.ts')], RULES), [])
})

test('a layer importing one it is not allowed is a problem naming what it may import', () => {
  assert.deepEqual(checkLayers([file('src/ui/table.ts', '../facts/log.ts')], RULES), [
    'src/ui/table.ts: imports facts (../facts/log.ts); ui may import contract — see layers.json',
  ])
})

test('a package is allowed by its name, subpaths included', () => {
  const files = [file('src/facts/log.ts', '@deepseek-ai/dsh-session'), file('src/facts/types.ts', '@deepseek-ai/dsh-session/types'), file('src/ui/table.ts', '@earendil-works/pi-tui')]
  assert.deepEqual(checkLayers(files, RULES), [])
})

test('a name is not a prefix: another package that starts with it is its own decision', () => {
  assert.deepEqual(checkLayers([file('src/facts/log.ts', '@deepseek-ai/dsh-session-query')], RULES), [
    'src/facts/log.ts: imports @deepseek-ai/dsh-session-query, which no layer is allowed; add it to layers.json if facts should know it',
  ])
})

test('a key ending in a colon is a prefix', () => {
  assert.deepEqual(checkLayers([file('src/host/index.ts', 'node:fs', 'node:path')], RULES), [])
})

test('an external package no rule names is a problem, so adding one is a decision', () => {
  assert.deepEqual(checkLayers([file('src/host/index.ts', 'left-pad')], RULES), [
    'src/host/index.ts: imports left-pad, which no layer is allowed; add it to layers.json if host should know it',
  ])
})

test('the process is the host\'s alone', () => {
  assert.deepEqual(checkLayers([file('src/ui/table.ts', 'node:fs')], RULES), [
    'src/ui/table.ts: imports node:fs; only host may — see layers.json',
  ])
})

test('the entry may import only what it is allowed, and a file outside every layer is a problem', () => {
  assert.deepEqual(checkLayers([file('src/index.ts', './host/index.ts')], RULES), [])
  assert.deepEqual(checkLayers([file('src/index.ts', './ui/table.ts')], RULES), [
    'src/index.ts: imports ui (./ui/table.ts); the entry may import host — see layers.json',
  ])
  assert.deepEqual(checkLayers([file('src/stray.ts')], RULES), [
    'src/stray.ts: is in no layer; move it under src/<layer>/',
  ])
})
