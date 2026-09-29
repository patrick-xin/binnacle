#!/usr/bin/env node
/**
 * Hold binnacle's declared dependencies to what its code and patch use.
 *
 * A package binnacle runs code from must be a dependency (bundled) or a
 * peerDependency (provided by the dsh install); so must a package whose row
 * the patch inserts, which must be a peer. A peerDependency that is neither
 * belongs in devDependencies. A package read for its types alone is declared
 * in some list.
 * @module binnacle/scripts/check-peers
 */
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/**
 * Derive what binnacle needs from other packages and compare it to its manifest.
 * @param {{ manifest: any, files: { path: string, text: string }[], patch: string }} input - the parsed package.json, the source files, and the patch text.
 * @returns {string[]} one line per problem, sorted.
 */
export function checkPeers({ manifest, files, patch }) {
  const { runs, types } = importsOf(files, manifest.name)
  const rows = rowsOf(patch, manifest.name)
  const problems = []
  for (const name of rows) {
    if (!manifest.peerDependencies?.[name]) {
      problems.push(`${name} is a row binnacle's patch inserts, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it`)
    }
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!runs.has(name) && !rows.has(name)) {
      problems.push(`${name} is a peerDependency, but binnacle runs none of its code and its patch inserts no row of it — move it to devDependencies, where a package whose types alone are read belongs`)
    }
  }
  for (const [name, path] of runs) {
    if (!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]) {
      problems.push(`${name} is imported by ${path} and its code runs, but it is in neither dependencies nor peerDependencies — move it to peerDependencies if the dsh install provides it, or to dependencies to bundle it`)
    }
  }
  for (const [name, path] of types) {
    if (!runs.has(name) && !manifest.devDependencies?.[name] && !manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]) {
      problems.push(`${name} is imported by ${path} for its types only, but is in none of devDependencies, dependencies and peerDependencies — add it to devDependencies`)
    }
  }
  return problems.toSorted()
}

/**
 * The packages a patch inserts rows of.
 * @param {string} patch - the patch's YAML text.
 * @param {string} own - binnacle's own package name, skipped.
 * @returns {Set<string>} the `name` of every row under an `insert`, at any depth.
 */
function rowsOf(patch, own) {
  const names = new Set()
  const walk = (node, inserted) => {
    if (Array.isArray(node)) return node.forEach(item => walk(item, inserted))
    if (typeof node !== 'object' || node === null) return
    if (inserted && typeof node.name === 'string' && node.name !== own) names.add(node.name)
    for (const [key, value] of Object.entries(node)) walk(value, inserted || key === 'insert')
  }
  walk(load(patch) ?? [], false)
  return names
}

/**
 * The package a module specifier names.
 * @param {string} specifier - an import specifier.
 * @returns {string | undefined} `@scope/name` or `name`; undefined for a relative specifier or a `node:` builtin.
 */
function packageOf(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return undefined
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * Sort each imported package by whether its code runs.
 * @param {{ path: string, text: string }[]} files - the source files.
 * @param {string} own - binnacle's own package name, skipped.
 * @returns {{ runs: Map<string, string>, types: Map<string, string> }} each package whose code runs, and each imported for types, with the first file that imports it that way.
 */
function importsOf(files, own) {
  const runs = new Map()
  const types = new Map()
  for (const { path, text } of files) {
    for (const node of parseSync(path, text).program.body) {
      if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportAllDeclaration') continue
      if (!node.source) continue
      const name = packageOf(node.source.value)
      if (name === undefined || name === own) continue
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type'
        || (node.specifiers?.length > 0 && node.specifiers.every(specifier => specifier.importKind === 'type' || specifier.exportKind === 'type'))
      const seen = typeOnly ? types : runs
      if (!seen.has(name)) seen.set(name, path)
    }
  }
  return { runs, types }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const bundle = join(root, 'packages', 'binnacle')
  const files = repositoryFiles(root).filter(file => /^packages\/binnacle\/src\/.*\.ts$/.test(file.path))
  const manifest = JSON.parse(readFileSync(join(bundle, 'package.json'), 'utf8'))
  const problems = checkPeers({ manifest, files, patch: readFileSync(join(bundle, 'cordis.patch.yml'), 'utf8') })
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-peers: ok (${files.length} modules)` : `check-peers: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
