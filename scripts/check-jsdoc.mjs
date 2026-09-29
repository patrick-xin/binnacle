#!/usr/bin/env node
/**
 * Refuse a name an author reads that does not state its contract.
 *
 * Every name a package's `src/api.ts` exports has a JSDoc block directly
 * above its declaration, with nothing but whitespace between: in `api.ts`, or
 * in the module it re-exports it from. Elsewhere a comment is kept only for
 * what code, tests and the folder note cannot say (AGENTS.md, *Code*), which
 * no gate can read.
 * @module binnacle/scripts/check-jsdoc
 */
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/**
 * The names a declaration exports.
 * @param {any} declaration - the exported declaration node.
 * @returns {string} its name, or its names joined for a multi-binding declaration.
 */
function declaredName(declaration) {
  if (declaration.id?.name) return declaration.id.name
  if (declaration.declarations) return declaration.declarations.map(item => item.id?.name ?? '?').join(', ')
  return 'default'
}

/**
 * Find the exports one module leaves undocumented.
 * @param {string} path - the file's path.
 * @param {string} text - the file's text.
 * @param {ReadonlySet<string>} [names] - the only exports to hold; every one when absent.
 * @returns {string[]} one line per undocumented export, with its 1-based line.
 */
export function undocumented(path, text, names) {
  const { program, comments } = parseSync(path, text)
  const lineOf = offset => text.slice(0, offset).split('\n').length
  const problems = []
  for (const node of program.body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration
      : node.type === 'ExportDefaultDeclaration' ? node.declaration : undefined
    if (!declaration) continue
    if (names !== undefined && !names.has(declaredName(declaration))) continue
    const above = comments.filter(comment => comment.end <= node.start).at(-1)
    const documented = above !== undefined && above.type === 'Block' && above.value.startsWith('*')
      && text.slice(above.end, node.start).trim() === ''
    if (!documented) problems.push(`${path}:${lineOf(node.start)}: ${declaredName(declaration)}`)
  }
  return problems
}

/**
 * Find what an author reads undocumented.
 * @param {string} entry - the author API's path.
 * @param {(path: string) => string} read - the text of a path.
 * @returns {string[]} one line per undocumented name.
 */
export function undocumentedSurface(entry, read) {
  const text = read(entry)
  const reexported = new Map()
  for (const node of parseSync(entry, text).program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.source?.value.startsWith('.')) continue
    const module = posix.join(posix.dirname(entry), node.source.value)
    const names = reexported.get(module) ?? new Set()
    for (const specifier of node.specifiers) names.add(specifier.local.name ?? specifier.local.value)
    reexported.set(module, names)
  }
  return [
    ...undocumented(entry, text),
    ...[...reexported].flatMap(([module, names]) => undocumented(module, read(module), names)),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = new Map(repositoryFiles(root).map(file => [file.path, file.text]))
  const entries = [...files.keys()].filter(path => /^packages\/[^/]+\/src\/api\.ts$/.test(path))
  const problems = entries.flatMap(entry => undocumentedSurface(entry, (path) => {
    const text = files.get(path)
    if (text === undefined) throw new Error(`${entry} re-exports from ${path}, which is not in the repository`)
    return text
  }))
  for (const problem of problems) console.error(`${problem} — an author reads it from api.ts: add a JSDoc block directly above it stating its contract`)
  console.log(problems.length === 0 ? `check-jsdoc: ok (${entries.length} author APIs)` : `check-jsdoc: ${problems.length} undocumented names an author reads`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
