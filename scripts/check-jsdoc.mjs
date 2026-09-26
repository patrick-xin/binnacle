#!/usr/bin/env node
/**
 * Refuse a source module that does not say what it is for, or an export that
 * does not state its contract.
 *
 * Every module under `packages/*\/src` opens with a JSDoc block saying what
 * it is for, set apart from what follows by a blank line or followed by its
 * imports; a block right above the first export is that export's. Every
 * declaration it exports has a JSDoc block directly above it, with nothing but
 * whitespace between. A re-export is documented where it is declared.
 * @module binnacle/scripts/check-jsdoc
 */
import { dirname, join } from 'node:path'
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
 * Find what one module leaves undocumented.
 * @param {string} path - the file's path.
 * @param {string} text - the file's text.
 * @returns {string[]} one line per missing module doc or undocumented export, with its 1-based line.
 */
export function undocumented(path, text) {
  const { program, comments } = parseSync(path, text)
  const lineOf = offset => text.slice(0, offset).split('\n').length
  const problems = []
  const first = program.body[0]
  const opening = comments[0]
  const isModuleDoc = opening?.type === 'Block' && opening.value.startsWith('*')
    && (first === undefined || (opening.end <= first.start && (first.type === 'ImportDeclaration' || /\n[ \t]*\n/.test(text.slice(opening.end, first.start)))))
  if (!isModuleDoc) problems.push(`${path}:1: the module opens with no JSDoc saying what it is for`)
  for (const node of program.body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration
      : node.type === 'ExportDefaultDeclaration' ? node.declaration : undefined
    if (!declaration) continue
    const above = comments.filter(comment => comment.end <= node.start).at(-1)
    const documented = above !== undefined && !(isModuleDoc && above === opening) && above.type === 'Block' && above.value.startsWith('*')
      && text.slice(above.end, node.start).trim() === ''
    if (!documented) problems.push(`${path}:${lineOf(node.start)}: ${declaredName(declaration)}`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter(file => /^packages\/[^/]+\/src\/.*\.ts$/.test(file.path))
  const problems = files.flatMap(file => undocumented(file.path, file.text))
  for (const problem of problems) console.error(`${problem} — add a JSDoc block stating its contract`)
  console.log(problems.length === 0 ? `check-jsdoc: ok (${files.length} modules)` : `check-jsdoc: ${problems.length} undocumented`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
