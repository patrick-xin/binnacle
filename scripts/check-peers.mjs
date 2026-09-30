#!/usr/bin/env node
/**
 * Hold binnacle's declared dependencies to what its code and patch use.
 *
 * A package binnacle runs code from must be a dependency (bundled) or a
 * peerDependency (provided by the dsh install); so must a package whose row
 * the patch inserts, which must be a peer. A peerDependency that is neither
 * belongs in devDependencies. A package read for its types alone is declared
 * in some list.
 *
 * A row that names a Cordis service in `inject` needs the package that provides
 * that service installed beside it, so that package is a peerDependency too
 * (and so is needed). `binnacle` is binnacle's own service and is skipped.
 * Every service an `inject` names has a row in the `services` table of
 * `packages/binnacle/layers.json`, naming its provider; and every row is held
 * to upstream: the provider's own type declarations must augment Cordis's
 * `Context` with that name.
 * @module binnacle/scripts/check-peers
 */
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/**
 * Derive what binnacle needs from other packages and compare it to its manifest.
 * @param {{ manifest: any, files: { path: string, text: string }[], patch: string, services?: Record<string, string>, provided?: (name: string) => Set<string> | undefined }} input - the parsed package.json, the source files, the patch text, layers.json's services table, and what a package's own types say it provides.
 * @returns {string[]} one line per problem, sorted.
 */
export function checkPeers({ manifest, files, patch, services = {}, provided = () => undefined }) {
  const { runs, types } = importsOf(files, manifest.name)
  const rows = rowsOf(patch, manifest.name)
  const problems = []
  const providers = new Set()
  for (const [service, provider] of Object.entries(services)) {
    const declared = provided(provider)
    if (declared === undefined) {
      problems.push(`${provider} is named in the services table of layers.json as the provider of ${service}, but it is not installed to read — add it to devDependencies`)
    } else if (!declared.has(service)) {
      problems.push(`${provider} is named in the services table of layers.json as the provider of ${service}, but its types do not declare ${service} on Context — name the package that does`)
    }
  }
  for (const [service, path] of injectsOf(files)) {
    const provider = services[service]
    if (provider === undefined) {
      problems.push(`${service} is named by ${path}'s inject, but the services table in layers.json has no row for it — name the package that provides it there`)
      continue
    }
    providers.add(provider)
    if (!manifest.peerDependencies?.[provider]) {
      problems.push(`${provider} provides ${service}, which ${path}'s inject names, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it`)
    }
  }
  for (const name of rows) {
    if (!manifest.peerDependencies?.[name]) {
      problems.push(`${name} is a row binnacle's patch inserts, but is not a peerDependency — add it to peerDependencies, for the dsh install must provide it`)
    }
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!runs.has(name) && !rows.has(name) && !providers.has(name)) {
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
 * A package's provided services, as its own types declare them.
 * @param {string} dir - the installed package's directory.
 * @returns {Set<string>} the members of `interface Context` inside `declare module '@deepseek-ai/cordis'`, in the file its package.json `types` (or `exports['.'].types`) names and every file that one reaches by a relative import or export. Empty when it declares none.
 */
export function servicesProvidedBy(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const entry = manifest.types ?? manifest.exports?.['.']?.types
  const provided = new Set()
  if (typeof entry !== 'string') return provided
  const seen = new Set()
  const read = path => {
    if (seen.has(path)) return
    seen.add(path)
    const file = [path, path.replace(/\.ts$/, '.d.ts'), `${path}.d.ts`].find(candidate => existsSync(candidate) && statSync(candidate).isFile())
    if (file === undefined) return
    for (const node of parseSync(file, readFileSync(file, 'utf8')).program.body) {
      if (node.source && typeof node.source.value === 'string' && node.source.value.startsWith('.')) read(join(dirname(file), node.source.value))
      if (node.type !== 'TSModuleDeclaration' || node.id?.value !== '@deepseek-ai/cordis') continue
      for (const member of node.body?.body ?? []) {
        if (member.type !== 'TSInterfaceDeclaration' || member.id.name !== 'Context') continue
        for (const property of member.body.body) if (property.key?.name !== undefined) provided.add(property.key.name)
      }
    }
  }
  read(join(dir, entry))
  return provided
}

/**
 * The Cordis services the modules' `inject` declarations name.
 * @param {{ path: string, text: string }[]} files - the source files.
 * @returns {Map<string, string>} each service but binnacle's own, with the first file whose `inject` names it. An `inject` is an array literal of strings, bound to `inject` or the value of an `inject` property, under any `satisfies`.
 */
function injectsOf(files) {
  const services = new Map()
  for (const { path, text } of files) {
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== 'object' || node === null) return
      const bound = node.type === 'VariableDeclarator' && node.id?.name === 'inject' ? node.init
        : node.type === 'Property' && node.key?.name === 'inject' ? node.value
          : undefined
      let array = bound
      while (array?.type === 'TSSatisfiesExpression' || array?.type === 'TSAsExpression') array = array.expression
      if (array?.type === 'ArrayExpression') {
        for (const element of array.elements) {
          if (element?.type === 'Literal' && typeof element.value === 'string' && element.value !== 'binnacle' && !services.has(element.value)) services.set(element.value, path)
        }
      }
      for (const value of Object.values(node)) walk(value)
    }
    walk(parseSync(path, text).program.body)
  }
  return services
}

/**
 * The packages a patch inserts rows of.
 * @param {string} patch - the patch's YAML text.
 * @param {string} own - binnacle's own package name, skipped.
 * @returns {Set<string>} the package each row under an `insert` names, at any depth: a row may name a subpath of one.
 */
function rowsOf(patch, own) {
  const names = new Set()
  const walk = (node, inserted) => {
    if (Array.isArray(node)) return node.forEach(item => walk(item, inserted))
    if (typeof node !== 'object' || node === null) return
    const name = inserted && typeof node.name === 'string' ? packageOf(node.name) : undefined
    if (name !== undefined && name !== own) names.add(name)
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
  const { services } = JSON.parse(readFileSync(join(bundle, 'layers.json'), 'utf8'))
  const provided = name => existsSync(join(bundle, 'node_modules', name, 'package.json')) ? servicesProvidedBy(join(bundle, 'node_modules', name)) : undefined
  const problems = checkPeers({ manifest, files, patch: readFileSync(join(bundle, 'cordis.patch.yml'), 'utf8'), services, provided })
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-peers: ok (${files.length} modules)` : `check-peers: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
