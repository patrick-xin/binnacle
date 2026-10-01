#!/usr/bin/env node
/**
 * Refuse a name an author reads that does not state its contract.
 *
 * Every declaration an author reaches from a package's `src/api.ts` — what it
 * exports, and what those mention, followed through the files they are
 * imported from — has a JSDoc block directly above it, with nothing but
 * whitespace between. Elsewhere a comment is kept only for
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
  if (declaration.declarations) return declaration.declarations.map((item) => item.id?.name ?? '?').join(', ')
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
  const lineOf = (offset) => text.slice(0, offset).split('\n').length
  const problems = []
  for (const node of program.body) {
    const declaration =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node.type === 'ExportDefaultDeclaration' ? node.declaration : undefined
    if (!declaration) continue
    if (names !== undefined && !names.has(declaredName(declaration))) continue
    const above = comments.filter((comment) => comment.end <= node.start).at(-1)
    const documented =
      above !== undefined && above.type === 'Block' && above.value.startsWith('*') && text.slice(above.end, node.start).trim() === ''
    if (!documented) problems.push(`${path}:${lineOf(node.start)}: ${declaredName(declaration)}`)
  }
  return problems
}

/**
 * Whether a JSDoc block sits directly above a node, with nothing but whitespace between.
 * @param {string} text - the file's text.
 * @param {{ start: number, end: number, type: string, value: string }[]} comments - the file's comments.
 * @param {{ start: number }} node - the node.
 * @returns {boolean} whether it is documented.
 */
function documentedAbove(text, comments, node) {
  const above = comments.filter((comment) => comment.end <= node.start).at(-1)
  return above !== undefined && above.type === 'Block' && above.value.startsWith('*') && text.slice(above.end, node.start).trim() === ''
}

/**
 * The part of a declaration an author reads: a function's signature without its body, a variable's type where it
 * names one, and the whole of anything else — for what a declaration mentions is what an author reaches through it.
 * @param {string} text - the file's text.
 * @param {any} declaration - the declaration node.
 * @returns {string} the text it mentions names in.
 */
function readText(text, declaration) {
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction')
    return text.slice(declaration.start, declaration.body?.start ?? declaration.end)
  if (declaration.type === 'VariableDeclaration')
    return declaration.declarations
      .map((item) =>
        item.id.typeAnnotation === undefined || item.id.typeAnnotation === null
          ? ''
          : text.slice(item.id.typeAnnotation.start, item.id.typeAnnotation.end),
      )
      .join('\n')
  return text.slice(declaration.start, declaration.end)
}

/** A function's body, or a variable's function body, which an author does not read. */
function bodyOf(declaration) {
  const init = declaration.declarations?.length === 1 ? declaration.declarations[0].init : undefined
  const body = declaration.body ?? init?.body
  return body?.type === 'BlockStatement' ? body : undefined
}

/**
 * One source module, read for the author's surface: what it declares, whether each is documented and what each
 * mentions, what it imports, and what it exports.
 * @param {string} path - the file's path.
 * @param {string} text - the file's text.
 * @returns {{ declared: Map<string, { line: number, end: number, documented: boolean, mentions: string[] }[]>, imported: Map<string, { spec: string, name: string }>, exported: string[] }} the module.
 */
function readModule(path, text) {
  const { program, comments } = parseSync(path, text)
  const lineOf = (offset) => text.slice(0, offset).split('\n').length
  const declared = new Map()
  const imported = new Map()
  const exported = []
  const declare = (name, outer, mentionedIn, end = outer.end) => {
    const statements = declared.get(name) ?? []
    statements.push({
      line: lineOf(outer.start),
      end: lineOf(end),
      documented: documentedAbove(text, comments, outer),
      mentions: [...new Set(mentionedIn.match(/[A-Za-z_$][\w$]*/g) ?? [])],
    })
    declared.set(name, statements)
  }
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers ?? [])
        imported.set(specifier.local.name, {
          spec: node.source.value,
          name: specifier.type === 'ImportSpecifier' ? (specifier.imported.name ?? specifier.imported.value) : 'default',
        })
      continue
    }
    if (node.type === 'TSModuleDeclaration' && node.id.type === 'Literal') {
      const name = `declare module '${node.id.value}'`
      declare(name, node, text.slice(node.start, node.end))
      exported.push(name)
      continue
    }
    const exporting = node.type === 'ExportNamedDeclaration'
    if (exporting && node.source) {
      for (const specifier of node.specifiers) {
        const name = specifier.exported.name ?? specifier.exported.value
        imported.set(name, { spec: node.source.value, name: specifier.local.name ?? specifier.local.value })
        exported.push(name)
      }
      continue
    }
    if (exporting && !node.declaration) {
      for (const specifier of node.specifiers) exported.push(specifier.local.name ?? specifier.local.value)
      continue
    }
    const declaration = exporting ? node.declaration : node
    const names = declaration.id?.name
      ? [declaration.id.name]
      : declaration.declarations
        ? declaration.declarations.map((item) => item.id?.name).filter(Boolean)
        : []
    for (const name of names) {
      declare(name, node, readText(text, declaration), bodyOf(declaration)?.start ?? node.end)
      if (exporting) exported.push(name)
    }
  }
  return { declared, imported, exported }
}

/**
 * Every declaration an author reads: each name the entry exports, and every declaration those mention, followed
 * through the files it is imported from, as the author API's surface test follows it; a package's name is not followed.
 * @param {string} entry - the author API's path.
 * @param {(path: string) => string} read - the text of a path.
 * @returns {{ path: string, line: number, end: number, name: string, documented: boolean }[]} each declaration, from its first line to the last an author reads, by file then line.
 */
export function authorSurface(entry, read) {
  const modules = new Map()
  const moduleOf = (path) => {
    if (!modules.has(path)) modules.set(path, readModule(path, read(path)))
    return modules.get(path)
  }
  const surface = []
  const seen = new Set()
  const visit = (path, name) => {
    if (seen.has(`${path}#${name}`)) return
    seen.add(`${path}#${name}`)
    const module = moduleOf(path)
    const statements = module.declared.get(name)
    if (statements !== undefined) {
      for (const statement of statements) {
        surface.push({ path, line: statement.line, end: statement.end, name, documented: statement.documented })
        for (const mentioned of statement.mentions)
          if (mentioned !== name && (module.declared.has(mentioned) || module.imported.has(mentioned))) visit(path, mentioned)
      }
      return
    }
    const from = module.imported.get(name)
    if (from !== undefined && from.spec.startsWith('.')) visit(posix.join(posix.dirname(path), from.spec), from.name)
  }
  for (const name of moduleOf(entry).exported) visit(entry, name)
  return surface.toSorted((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
}

/**
 * Find what an author reads undocumented.
 * @param {string} entry - the author API's path.
 * @param {(path: string) => string} read - the text of a path.
 * @returns {string[]} one line per undocumented declaration, with its 1-based line, by file then line.
 */
export function undocumentedSurface(entry, read) {
  return authorSurface(entry, read)
    .filter(({ documented }) => !documented)
    .map(({ path, line, name }) => `${path}:${line}: ${name}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = new Map(repositoryFiles(root).map((file) => [file.path, file.text]))
  const entries = [...files.keys()].filter((path) => /^packages\/[^/]+\/src\/api\.ts$/.test(path))
  const problems = entries.flatMap((entry) =>
    undocumentedSurface(entry, (path) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`${entry} re-exports from ${path}, which is not in the repository`)
      return text
    }),
  )
  for (const problem of problems)
    console.error(`${problem} — an author reads it from api.ts: add a JSDoc block directly above it stating its contract`)
  console.log(
    problems.length === 0
      ? `check-jsdoc: ok (${entries.length} author APIs)`
      : `check-jsdoc: ${problems.length} undocumented names an author reads`,
  )
  process.exitCode = problems.length === 0 ? 0 : 1
}
