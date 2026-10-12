#!/usr/bin/env node
// A built-in uses only what an author can import (ADR 0004). Inside the package, `binnacle` is `src/index.ts`, and `binnacle/plugins/<name>` is `src/plugins/<name>/index.ts`.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const WITH_SOURCE = new Set(['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'])

function walk(node, visit) {
  if (Array.isArray(node)) for (const each of node) walk(each, visit)
  else if (node !== null && typeof node === 'object') {
    if (typeof node.type === 'string') visit(node)
    for (const key of Object.keys(node)) if (key !== 'parent') walk(node[key], visit)
  }
}

/** A path written out whole: a string, or a template with no hole. */
function pathOf(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return undefined
}

// A cast of the service to a wider type reaches what the API does not name.
const widensBinnacle = (type) =>
  type?.type === 'TSIntersectionType' && type.types.some((part) => part.type === 'TSTypeReference' && part.typeName?.name === 'Binnacle')

/**
 * What the code reaches, each with its offset: a module path of an import, an export from, a side-effect import, a dynamic import or an import type;
 * a dynamic import whose path is not written out whole, as `unreadable`; and a cast of `Binnacle` to a wider type, as `cast`.
 */
export function reachesOf(path, text) {
  const { program, errors } = parseSync(path, text, { lang: 'ts', sourceType: 'module' })
  if (errors.length > 0) return [{ at: 0, kind: 'unreadable', from: `a file that does not parse: ${errors[0].message}` }]
  const found = []
  walk(program, (node) => {
    if (WITH_SOURCE.has(node.type) && node.source !== null && node.source !== undefined)
      found.push({ at: node.source.start, from: node.source.value })
    else if (node.type === 'ImportExpression' || node.type === 'TSImportType') {
      const written = pathOf(node.source ?? node.argument)
      if (written === undefined) found.push({ at: node.start, kind: 'unreadable', from: text.slice(node.start, node.end) })
      else found.push({ at: node.start, from: written })
    } else if ((node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') && widensBinnacle(node.typeAnnotation)) {
      found.push({ at: node.start, kind: 'cast', from: text.slice(node.start, node.end) })
    }
  })
  return found
}

/** Where a path leads, as a path under `src/`, or the package it names. */
function targetOf(path, from) {
  if (!from.startsWith('.')) return { package: from }
  return { file: posix.normalize(posix.join('plugins', posix.dirname(path), from)) }
}

function allowed(path, from) {
  const target = targetOf(path, from)
  if (target.package !== undefined) return target.package === '@deepseek-ai/cordis' || target.package.startsWith('@deepseek-ai/dsh-')
  const own = `plugins/${path.split('/')[0]}/`
  return target.file === 'index.ts' || /^plugins\/[\w-]+\/index\.ts$/.test(target.file) || target.file.startsWith(own)
}

export function findInternalImports(files) {
  const found = []
  for (const { path, text } of files) {
    for (const { at, from, kind } of reachesOf(path, text)) {
      if (kind !== undefined || !allowed(path, from)) found.push({ path, line: text.slice(0, at).split('\n').length, from })
    }
  }
  return found.toSorted((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
}

function builtInFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => ({ path: path.split('\\').join('/'), text: readFileSync(join(root, path), 'utf8') }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
  const root = join(repository, 'packages', 'binnacle', 'src', 'plugins')
  const found = findInternalImports(builtInFiles(root))
  for (const { path, line, from } of found) {
    console.error(`${relative(repository, join(root, path))}:${line}: ${from} reaches past what an author can import`)
  }
  console.log(found.length === 0 ? 'check-plugins: ok' : `check-plugins: ${found.length} reaches past what an author can import`)
  process.exitCode = found.length === 0 ? 0 : 1
}
