#!/usr/bin/env node
/**
 * Hold every source module to the layer it sits in.
 *
 * A module under `src/<layer>/` may import only the layers its layer is
 * allowed, and only the external packages a prefix in `layers.json` allows
 * its layer; `src/index.ts`, the entry, may import only what `entry` names.
 * An external package no prefix names is refused everywhere, so knowing a new
 * package is a decision written into `layers.json`, not a line slipped into a
 * module. Tests sit outside `src` and are not held.
 * @module binnacle/scripts/check-layers
 */
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/**
 * The layer rules, as `layers.json` holds them.
 * @typedef {{ root: string, entry: string[], layers: Record<string, string[]>, external: Record<string, string[]> }} Rules
 */

/**
 * Which layer a path under the root is in.
 * @param {string} path - the path, relative to the package.
 * @param {Rules} rules - the rules.
 * @returns {string | undefined} the layer, `entry` for the entry module, or undefined for a file in no layer.
 */
function layerOf(path, rules) {
  const inRoot = relative(rules.root, path)
  if (inRoot === 'index.ts') return 'entry'
  const [first, ...rest] = inRoot.split('/')
  return rest.length > 0 && first !== undefined && first in rules.layers ? first : undefined
}

/**
 * The modules a source text imports or re-exports from.
 * @param {string} path - the file's path, for the parser.
 * @param {string} text - the file's text.
 * @returns {string[]} each specifier, in order.
 */
function specifiers(path, text) {
  const { module } = parseSync(path, text)
  return [
    ...module.staticImports.map(entry => entry.moduleRequest.value),
    ...module.staticExports.flatMap(entry => entry.entries.flatMap(item => item.moduleRequest ? [item.moduleRequest.value] : [])),
  ]
}

/**
 * Check every module against the layer rules.
 * @param {{ path: string, text: string }[]} files - the source files, by path relative to the package.
 * @param {Rules} rules - the rules.
 * @returns {string[]} one line per import a layer is not allowed, and per file in no layer.
 */
export function checkLayers(files, rules) {
  const problems = []
  for (const file of files) {
    const layer = layerOf(file.path, rules)
    if (layer === undefined) {
      problems.push(`${file.path}: is in no layer; move it under ${rules.root}/<layer>/`)
      continue
    }
    const allowed = layer === 'entry' ? rules.entry : rules.layers[layer] ?? []
    const who = layer === 'entry' ? 'the entry' : layer
    for (const spec of new Set(specifiers(file.path, file.text))) {
      if (spec.startsWith('.')) {
        const target = layerOf(normalize(join(dirname(file.path), spec)), rules)
        if (target === layer) continue
        if (target === undefined || !allowed.includes(target)) {
          problems.push(`${file.path}: imports ${target ?? 'a file in no layer'} (${spec}); ${who} may import ${allowed.join(', ') || 'no other layer'} — see layers.json`)
        }
        continue
      }
      const prefix = Object.keys(rules.external).filter(key => spec.startsWith(key)).toSorted((a, b) => b.length - a.length)[0]
      if (prefix === undefined) {
        problems.push(`${file.path}: imports ${spec}, which no layer is allowed; add it to layers.json if ${who} should know it`)
      } else if (!rules.external[prefix].includes(layer)) {
        problems.push(`${file.path}: imports ${spec}; only ${rules.external[prefix].join(', ')} may — see layers.json`)
      }
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const packageDir = join(root, 'packages', 'binnacle')
  const rules = JSON.parse(readFileSync(join(packageDir, 'layers.json'), 'utf8'))
  const files = repositoryFiles(root)
    .filter(file => file.path.startsWith('packages/binnacle/src/') && file.path.endsWith('.ts'))
    .map(file => ({ path: relative('packages/binnacle', file.path), text: file.text }))
  const problems = checkLayers(files, rules)
  for (const problem of problems) console.error(`packages/binnacle/${problem}`)
  console.log(problems.length === 0 ? `check-layers: ok (${files.length} modules)` : `check-layers: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
