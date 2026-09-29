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

test('a dynamic import naming its module is held as a static one is', () => {
  const dynamic = { path: 'src/ui/table.ts', text: "const log = await import('../facts/log.ts')\nconst fs = await import(`node:fs`)\n" }
  assert.deepEqual(checkLayers([dynamic], RULES), [
    'src/ui/table.ts: imports facts (../facts/log.ts); ui may import contract — see layers.json',
    'src/ui/table.ts: imports node:fs; only host may — see layers.json',
  ])
})

test('a dynamic import whose module is decided at run time is a problem, since no rule can hold it', () => {
  const dynamic = { path: 'src/host/index.ts', text: 'const which = `../${name}.ts`\nawait import(which)\nawait import(`../${name}.ts`)\n' }
  assert.deepEqual(checkLayers([dynamic], RULES), [
    'src/host/index.ts: imports a module named at run time (which); name it with a string so layers.json can hold it',
    'src/host/index.ts: imports a module named at run time (`../${name}.ts`); name it with a string so layers.json can hold it',
  ])
})

test('a dynamic import is held to the module it loads, escapes decoded', () => {
  const dynamic = { path: 'src/ui/table.ts', text: "await import('../ui/\\u002e\\u002e/host/index.ts')\nawait import(`../\\u0066acts/log.ts`)\n" }
  assert.deepEqual(checkLayers([dynamic], RULES), [
    'src/ui/table.ts: imports host (../ui/../host/index.ts); ui may import contract — see layers.json',
    'src/ui/table.ts: imports facts (../facts/log.ts); ui may import contract — see layers.json',
  ])
})

const API = {
  root: 'src',
  entry: ['host', 'api.ts'],
  layers: { contract: [], views: ['contract'], 'api.ts': ['views'], plugins: ['api.ts'], host: ['contract', 'views', 'api.ts', 'plugins'] },
  isolated: ['plugins'],
  typeOnly: ['plugins'],
  external: { '@deepseek-ai/cordis': ['host', 'plugins'], '@deepseek-ai/dsh-tools': ['plugins'] },
}
const source = (path, text) => ({ path, text })

test('a module at the root that layers.json names is a layer of its own', () => {
  assert.deepEqual(checkLayers([file('src/api.ts', './views/view.ts'), file('src/plugins/export.ts', '../api.ts'), file('src/index.ts', './api.ts')], API), [])
  assert.deepEqual(checkLayers([file('src/plugins/export.ts', '../views/view.ts')], API), [
    'src/plugins/export.ts: imports views (../views/view.ts); plugins may import api.ts — see layers.json',
  ])
})

test('each unit of an isolated layer imports its own files, never a sibling\'s', () => {
  assert.deepEqual(checkLayers([file('src/plugins/export/index.ts', './render.ts', '../../api.ts')], API), [])
  assert.deepEqual(checkLayers([file('src/plugins/export/render.ts', '../settings.ts'), file('src/plugins/login.ts', './export/render.ts')], API), [
    'src/plugins/export/render.ts: imports settings, another unit of plugins (../settings.ts); a unit of plugins imports only its own files — see layers.json',
    'src/plugins/login.ts: imports export, another unit of plugins (./export/render.ts); a unit of plugins imports only its own files — see layers.json',
  ])
})

test('a root module is its layer, and a folder of its name is not', () => {
  assert.deepEqual(checkLayers([file('src/plugins/export.ts', '../api/private.ts'), file('src/api/private.ts')], API), [
    'src/plugins/export.ts: imports a file in no layer (../api/private.ts); plugins may import api.ts — see layers.json',
    'src/api/private.ts: is in no layer; move it under src/<layer>/',
  ])
})

test('a layer typeOnly names reaches other layers only through import type, never loading them', () => {
  const allowed = source('src/plugins/export/index.ts', "import type { View } from '../../api.ts'\nexport type * from '../../api.ts'\nimport { render } from './render.ts'\n")
  assert.deepEqual(checkLayers([allowed], API), [])
  const loading = source('src/plugins/probe.ts', "import '../api.ts'\nimport { type View } from '../api.ts'\nexport * from '../api.ts'\nawait import('../api.ts')\n")
  const problem = 'src/plugins/probe.ts: loads api.ts at run time (../api.ts); plugins reaches other layers only through import type or export type — see layers.json'
  assert.deepEqual(checkLayers([loading], API), [problem, problem, problem, problem])
})

test('a layer typeOnly names imports an external package only through import type, never loading it', () => {
  const path = 'src/plugins/tool.ts'
  const allowed = source(path, "import type { Context } from '@deepseek-ai/cordis'\nexport type { ToolRuntime } from '@deepseek-ai/dsh-tools'\n")
  assert.deepEqual(checkLayers([allowed], API), [])
  const loading = source(path, "import { Service } from '@deepseek-ai/cordis'\nimport { type ToolRuntime } from '@deepseek-ai/dsh-tools'\nexport * from '@deepseek-ai/dsh-tools'\nawait import('@deepseek-ai/dsh-tools/kinds')\n")
  const refused = (name, spec) => `${path}: loads ${name} at run time (${spec}); plugins reaches external packages only through import type or export type — see layers.json`
  assert.deepEqual(checkLayers([loading], API), [
    refused('@deepseek-ai/cordis', '@deepseek-ai/cordis'),
    refused('@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tools'),
    refused('@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tools'),
    refused('@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tools/kinds'),
  ])
})

const OWNED = {
  ...RULES,
  layers: { ...RULES.layers, panes: ['contract', 'ui'] },
  external: { ...RULES.external, '@earendil-works/pi-tui': ['ui', 'panes', 'host'] },
  owners: { '@earendil-works/pi-tui': { TuiMouseEvent: ['ui/pointer.ts', 'panes/screen.ts'] } },
}

test('a symbol the owners table names is imported by its owners alone, and any other file is told who owns it', () => {
  const owner = source('src/ui/pointer.ts', "import type { TuiMouseEvent } from '@earendil-works/pi-tui'\n")
  const stray = source('src/panes/transcript.ts', "import type { Component, TuiMouseEvent } from '@earendil-works/pi-tui'\n")
  assert.deepEqual(checkLayers([owner, stray], OWNED), [
    'src/panes/transcript.ts: imports TuiMouseEvent from @earendil-works/pi-tui, which only ui/pointer.ts, panes/screen.ts may; take what you need from one of them, or name this file among its owners in layers.json',
  ])
})

test('an owned symbol cannot be reached around its owners: re-exported, or with the whole package at once', () => {
  const path = 'src/ui/table.ts'
  const around = source(path, "export type { TuiMouseEvent as Mouse } from '@earendil-works/pi-tui'\nimport * as tui from '@earendil-works/pi-tui'\nexport * from '@earendil-works/pi-tui'\nawait import('@earendil-works/pi-tui')\n")
  const whole = `${path}: imports all of @earendil-works/pi-tui at once, which reaches TuiMouseEvent, which only ui/pointer.ts, panes/screen.ts may; import by name what you need`
  assert.deepEqual(checkLayers([around], OWNED), [
    `${path}: imports TuiMouseEvent from @earendil-works/pi-tui, which only ui/pointer.ts, panes/screen.ts may; take what you need from one of them, or name this file among its owners in layers.json`,
    whole, whole, whole,
  ])
})

test('an owner may not re-export an owned symbol with export from, since any file could then import it from the owner', () => {
  const owner = source('src/ui/pointer.ts', "export { TuiMouseEvent } from '@earendil-works/pi-tui'\n")
  assert.deepEqual(checkLayers([owner], OWNED), [
    'src/ui/pointer.ts: re-exports TuiMouseEvent from @earendil-works/pi-tui, which lets any file import it from here; export what you make of it, and leave the symbol to its owners in layers.json',
  ])
})

test('an owner may not export an owned symbol it imported, plainly, aliased or as a type', () => {
  const message = symbol => `src/ui/pointer.ts: re-exports ${symbol} from @earendil-works/pi-tui, which lets any file import it from here; export what you make of it, and leave the symbol to its owners in layers.json`
  const plain = source('src/ui/pointer.ts', "import { TuiMouseEvent } from '@earendil-works/pi-tui'\nexport { TuiMouseEvent }\n")
  const aliased = source('src/ui/pointer.ts', "import { TuiMouseEvent as Mouse } from '@earendil-works/pi-tui'\nexport { Mouse as Click }\n")
  const typed = source('src/ui/pointer.ts', "import type { TuiMouseEvent } from '@earendil-works/pi-tui'\nexport type { TuiMouseEvent }\n")
  for (const file of [plain, aliased, typed]) assert.deepEqual(checkLayers([file], OWNED), [message('TuiMouseEvent')])
})
