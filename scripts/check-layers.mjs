#!/usr/bin/env node
/**
 * Hold every source module to the layer it sits in.
 *
 * A module under `src/<layer>/` may import only the layers its layer is
 * allowed, and only the external packages `layers.json` allows its layer;
 * `src/index.ts`, the entry, may import only what `entry` names, and a
 * module at the root that `layers` names by its file name, `api.ts`, is a
 * layer of its own. In a layer `isolated` names, each file or folder
 * directly under it is a unit that imports only its own files, never a
 * sibling's. A layer `typeOnly` names reaches other layers only through
 * `import type` and `export type`, which load nothing at run time. A key in
 * `external` names one package and its subpaths, unless it ends in `:`, `/`
 * or `-`, when it is a prefix (`node:`). A package no key names is refused
 * everywhere, so knowing a new package — a new dsh package above all — is a
 * decision written into `layers.json`, not a line slipped into a module.
 * A dynamic import is held as a static one is, and one whose module is
 * decided at run time is refused, since no rule can hold it. Tests sit
 * outside `src` and are not held.
 * @module binnacle/scripts/check-layers
 */
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/**
 * The layer rules, as `layers.json` holds them.
 * @typedef {{ root: string, entry: string[], layers: Record<string, string[]>, isolated?: string[], typeOnly?: string[], external: Record<string, string[]> }} Rules
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
  if (first === undefined) return undefined
  if (rest.length === 0) return first in rules.layers ? first : undefined
  return first in rules.layers && !first.endsWith('.ts') ? first : undefined
}

/**
 * Which unit of its layer a path is in: the file or folder directly under the layer.
 * @param {string} path - the path, relative to the package.
 * @param {Rules} rules - the rules.
 * @returns {string | undefined} the unit's name, without a file's extension.
 */
function unitOf(path, rules) {
  return relative(rules.root, path).split('/')[1]?.replace(/\.ts$/, '')
}

/**
 * Every dynamic import in a program, with the module it loads when a string names it.
 * @param {unknown} node - the program, or a node in it.
 * @param {string} text - the program's text.
 * @param {{ module?: string, source: string }[]} found - where each is added, in order.
 * @returns {{ module?: string, source: string }[]} `found`: each import's module as the parser decoded it, absent when decided at run time, and its argument as written.
 */
function dynamicImports(node, text, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) dynamicImports(child, text, found)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  if (node.type === 'ImportExpression') {
    const { source } = node
    const module = source.type === 'Literal' && typeof source.value === 'string' ? source.value
      : source.type === 'TemplateLiteral' && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined
    found.push({ ...module === undefined ? {} : { module }, source: text.slice(source.start, source.end) })
  }
  for (const value of Object.values(node)) dynamicImports(value, text, found)
  return found
}

/**
 * The modules a source text imports or re-exports from.
 * @param {string} path - the file's path, for the parser.
 * @param {string} text - the file's text.
 * @returns {{ named: { spec: string, typeOnly: boolean }[], unnamed: string[] }} each specifier, in order, and whether its declaration is `import type` or `export type`, a dynamic import's included when a string names it; and the argument of each dynamic import whose module is decided at run time.
 */
function specifiers(path, text) {
  const { program } = parseSync(path, text)
  const dynamic = dynamicImports(program, text)
  const declared = program.body.flatMap(node => {
    if (node.type === 'ImportDeclaration') return [{ spec: node.source.value, typeOnly: node.importKind === 'type' }]
    if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) return [{ spec: node.source.value, typeOnly: node.exportKind === 'type' }]
    return []
  })
  return {
    named: [...declared, ...dynamic.flatMap(entry => entry.module === undefined ? [] : [{ spec: entry.module, typeOnly: false }])],
    unnamed: dynamic.flatMap(entry => entry.module === undefined ? [entry.source] : []),
  }
}

/**
 * Whether a key in `external` covers an import specifier.
 * @param {string} key - the key: a package name, or a prefix ending in `:`, `/` or `-`.
 * @param {string} spec - the specifier.
 * @returns {boolean} true when the key is a prefix of it, or names its package.
 */
function covers(key, spec) {
  return /[:/-]$/.test(key) ? spec.startsWith(key) : spec === key || spec.startsWith(`${key}/`)
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
    const { named, unnamed } = specifiers(file.path, file.text)
    for (const source of unnamed) problems.push(`${file.path}: imports a module named at run time (${source}); name it with a string so layers.json can hold it`)
    for (const { spec, typeOnly } of named) {
      if (spec.startsWith('.')) {
        const resolved = normalize(join(dirname(file.path), spec))
        const target = layerOf(resolved, rules)
        if (target === layer) {
          const unit = unitOf(resolved, rules)
          if (rules.isolated?.includes(layer) && unit !== unitOf(file.path, rules)) {
            problems.push(`${file.path}: imports ${unit}, another unit of ${layer} (${spec}); a unit of ${layer} imports only its own files — see layers.json`)
          }
          continue
        }
        if (target === undefined || !allowed.includes(target)) {
          problems.push(`${file.path}: imports ${target ?? 'a file in no layer'} (${spec}); ${who} may import ${allowed.join(', ') || 'no other layer'} — see layers.json`)
        } else if (!typeOnly && rules.typeOnly?.includes(layer)) {
          problems.push(`${file.path}: loads ${target} at run time (${spec}); ${layer} reaches other layers only through import type or export type — see layers.json`)
        }
        continue
      }
      const key = Object.keys(rules.external).filter(candidate => covers(candidate, spec)).toSorted((a, b) => b.length - a.length)[0]
      if (key === undefined) {
        problems.push(`${file.path}: imports ${spec}, which no layer is allowed; add it to layers.json if ${who} should know it`)
      } else if (!rules.external[key].includes(layer)) {
        problems.push(`${file.path}: imports ${spec}; only ${rules.external[key].join(', ')} may — see layers.json`)
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
