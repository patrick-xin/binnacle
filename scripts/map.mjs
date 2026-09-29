#!/usr/bin/env node
/**
 * Print a map of the code, derived from the code.
 *
 * For each `.ts` module under `packages/binnacle/src/` (or under one folder of
 * it): its line from its folder's `AGENTS.md`, what it exports and re-exports,
 * which modules import it, and which of its names the author API takes. Only
 * relative specifiers link modules; a package re-export shows the package.
 * @module binnacle/scripts/map
 */
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

const SRC = 'packages/binnacle/src/'

/**
 * The names a declaration exports.
 * @param {any} declaration - the exported declaration node.
 * @returns {string[]} its name, or the name of each binding of a multi-binding declaration.
 */
function declared(declaration) {
  if (declaration.id?.name) return [declaration.id.name]
  return (declaration.declarations ?? []).flatMap(item => (item.id?.name ? [item.id.name] : []))
}

/**
 * What a module exports, in source order.
 * @param {string} path - the module's path, for the parser.
 * @param {string} text - the module's text.
 * @returns {string[]} the names it declares and exports.
 */
function exportsOf(path, text) {
  const names = []
  for (const node of parseSync(path, text).program.body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration) names.push(...declared(node.declaration))
  }
  return names
}

/**
 * The name a module specifier exports under.
 * @param {any} name - an `exported` node: an identifier or a string literal.
 * @returns {string} the name.
 */
function nameOf(name) {
  return name.name ?? name.value
}

/**
 * What a module re-exports from another.
 * @param {string} path - the module's path relative to `src/`, for the parser and to resolve relative specifiers.
 * @param {string} text - the module's text.
 * @returns {{ name: string, from: string }[]} each name re-exported, `*` for `export *`, in source order, with the module it comes from: relative to `src/` when the specifier is relative, else the package as written.
 */
function reExportsOf(path, text) {
  const found = []
  for (const node of parseSync(path, text).program.body) {
    if (!node.source || (node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportAllDeclaration')) continue
    const spec = node.source.value
    const from = spec.startsWith('.') ? posix.join(posix.dirname(path), spec) : spec
    if (node.type === 'ExportAllDeclaration') found.push({ name: node.exported ? nameOf(node.exported) : '*', from })
    else for (const specifier of node.specifiers) found.push({ name: nameOf(specifier.exported), from })
  }
  return found
}

/**
 * Every module a module imports or re-exports from by a relative specifier.
 * @param {string} path - the module's path relative to `src/`.
 * @param {string} text - the module's text.
 * @param {Set<string>} known - the paths of every module, relative to `src/`.
 * @returns {{ target: string, names: string[] }[]} each relative specifier that resolves to a module (as `./x.ts`, `./x.js`, `./x` or a folder holding `index.ts`), with the names it takes from it: `*` for a namespace import or `export *`, `default` for a default import; a specifier that resolves to none is left out.
 */
function importsOf(path, text, known) {
  const found = []
  for (const node of parseSync(path, text).program.body) {
    if (!node.source || !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) continue
    const spec = node.source.value
    if (!spec.startsWith('.')) continue
    const base = posix.join(posix.dirname(path), spec)
    const target = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}/index.ts`].find(candidate => known.has(candidate))
    if (target === undefined) continue
    const names = node.type === 'ImportDeclaration'
      ? node.specifiers.map(specifier => specifier.type === 'ImportSpecifier' ? nameOf(specifier.imported) : specifier.type === 'ImportDefaultSpecifier' ? 'default' : '*')
      : node.type === 'ExportAllDeclaration' ? ['*'] : node.specifiers.map(specifier => nameOf(specifier.local))
    found.push({ target, names })
  }
  return found
}

/**
 * The note line a folder's `AGENTS.md` gives a module.
 * @param {{ path: string, text: string }[]} files - the repository files.
 * @param {string} path - the module's path relative to `src/`.
 * @returns {string} the text after the dash, or an empty string when no bullet names the module.
 */
function noteOf(files, path) {
  const slash = path.lastIndexOf('/')
  const notePath = `${SRC}${slash < 0 ? '' : path.slice(0, slash + 1)}AGENTS.md`
  const name = path.slice(slash + 1)
  const note = files.find(file => file.path === notePath)
  for (const line of note?.text.split('\n') ?? []) {
    if (line.startsWith('## ')) break
    if (line.startsWith(`- \`${name}\``)) return line.slice(name.length + 4).replace(/^\s*[—-]\s*/, '')
  }
  return ''
}

/**
 * The map of the modules under `src/`.
 * @param {{ path: string, text: string }[]} files - the repository files, the `AGENTS.md` notes among them.
 * @param {string} [folder] - a folder under `src/` to limit the map to.
 * @returns {{ path: string, note: string, exports: string[], reExports: { name: string, from: string }[], importedBy: string[], authorApi: string[] }[]} one entry per module, ordered by path, its path relative to `src/`.
 */
export function mapOf(files, folder) {
  const modules = files.filter(file => file.path.startsWith(SRC) && file.path.endsWith('.ts')).map(file => ({ ...file, path: file.path.slice(SRC.length) }))
  const known = new Set(modules.map(module => module.path))
  const importers = new Map()
  for (const module of modules) {
    for (const { target } of importsOf(module.path, module.text, known)) importers.set(target, new Set([...importers.get(target) ?? [], module.path]))
  }
  const api = modules.find(module => module.path === 'api.ts')
  const taken = new Map()
  for (const { target, names } of api ? importsOf(api.path, api.text, known) : []) taken.set(target, [...taken.get(target) ?? [], ...names])
  const shown = folder === undefined ? modules : modules.filter(module => module.path.startsWith(`${folder.replace(/\/$/, '')}/`))
  return shown.toSorted((a, b) => (a.path < b.path ? -1 : 1)).map(module => {
    const exports = exportsOf(module.path, module.text)
    const reExports = reExportsOf(module.path, module.text)
    const names = taken.get(module.path) ?? []
    return {
      path: module.path,
      note: noteOf(files, module.path),
      exports,
      reExports,
      importedBy: [...importers.get(module.path) ?? []].toSorted(),
      authorApi: [...exports, ...reExports.map(reExport => reExport.name)].filter(name => names.includes('*') || names.includes(name)),
    }
  })
}

/**
 * The map as text.
 * @param {ReturnType<typeof mapOf>} map - what `mapOf` returned.
 * @returns {string} a line per module, its path and ` — ` and its note (the path alone when it has none), then an indented line for each of exports, re-exports (names grouped by the module they come from, in the order each module first appears), imported by and author API (each name followed by ` (api.ts)`) that is not empty; every line ends in a newline.
 */
export function formatMap(map) {
  const lines = []
  for (const entry of map) {
    lines.push(entry.note === '' ? entry.path : `${entry.path} — ${entry.note}`)
    if (entry.exports.length > 0) lines.push(`  exports: ${entry.exports.join(', ')}`)
    if (entry.reExports.length > 0) {
      const groups = new Map()
      for (const { name, from } of entry.reExports) groups.set(from, [...groups.get(from) ?? [], name])
      lines.push(`  re-exports: ${[...groups].map(([from, names]) => `${names.join(', ')} ← ${from}`).join('; ')}`)
    }
    if (entry.importedBy.length > 0) lines.push(`  imported by: ${entry.importedBy.join(', ')}`)
    if (entry.authorApi.length > 0) lines.push(`  author API: ${entry.authorApi.join(', ')} (api.ts)`)
  }
  return lines.map(line => `${line}\n`).join('')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter(file => file.path.startsWith(SRC) && (file.path.endsWith('.ts') || file.path.endsWith('/AGENTS.md')))
  process.stdout.write(formatMap(mapOf(files, process.argv[2])))
}
