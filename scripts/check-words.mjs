#!/usr/bin/env node
/**
 * Refuse a key spelled in a plugin's words.
 *
 * A plugin never spells a key: which keys answer something is the key
 * table's, and an ask names them on its bottom edge, as a person bound them.
 * So a string or template literal in a module under
 * `packages/binnacle/src/plugins/` may not name a key as a word — `enter`,
 * `esc`, `escape`, `tab`, `space`, `backspace`, `up`, `down`, `left`,
 * `right`, whole and in any case — nor a chord of pi-tui's modifiers and a
 * key (`ctrl+c`, `shift+tab`, `alt-x`). What no person reads is not a word:
 * a module path, a type, a property's name, and the `key` of the object a
 * `.screen(name, {...})` call places, the binding its plugin offers the table. The short directions are matched as
 * whole words: `set up` and `left out` are refused too, and are rephrased.
 * Its own gate, not a rule of check-layers, which reads what a module
 * imports, never what it says.
 * @module binnacle/scripts/check-words
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'

/** A key named as a word. */
const WORD = String.raw`\b(?:enter|esc|escape|tab|space|backspace|up|down|left|right)\b`

/**
 * A chord: one or more of pi-tui's modifiers (`pi:packages/tui/src/keys.ts#KeyId`),
 * each joined by `+` or `-`, then a key — a special key's name, a letter or
 * digit alone, or a symbol — so `alt-text` is a word and `alt-x` a chord.
 */
const CHORD = String.raw`\b(?:(?:ctrl|shift|alt|super)[+-])+(?:(?:escape|esc|enter|return|tab|space|backspace|delete|insert|home|end|pageup|pagedown|up|down|left|right|f\d{1,2})\b|[a-z0-9](?![a-z0-9])|[^\sa-z0-9])`

/** A key a string may name, a chord tried first so it is named whole. */
const KEY = new RegExp(`${CHORD}|${WORD}`, 'i')

/** The nodes whose `source` names a module. */
const MODULES = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'])

/**
 * Every literal in a program that says words, with what each says.
 * @param {unknown} node - the program, or a node in it.
 * @param {{ start: number, end: number, says: string[] }[]} found - where each is added, in order.
 * @param {Set<unknown>} bindings - the `key` properties of the objects screens are placed with, which say no words; found as the walk reaches each call.
 * @returns {{ start: number, end: number, says: string[] }[]} `found`.
 */
function literals(node, found = [], bindings = new Set()) {
  if (Array.isArray(node)) {
    for (const child of node) literals(child, found, bindings)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  // A screen's key is the binding its plugin offers the key table (`binnacle:packages/binnacle/src/api.ts#PlacedScreen`), which a person rebinds there: a key id, not a word. It is one only in the object a `.screen(name, {...})` call places; a `key` anywhere else says what its value says.
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.name === 'screen' &&
    node.arguments[1]?.type === 'ObjectExpression'
  ) {
    for (const property of node.arguments[1].properties) {
      if (
        property.type === 'Property' &&
        !property.computed &&
        property.key.type === 'Identifier' &&
        property.key.name === 'key' &&
        property.value.type === 'Literal'
      )
        bindings.add(property)
    }
  }
  if (bindings.has(node)) return found
  // A type says what a value may be, and a module path where code is; neither is drawn.
  if (node.type === 'TSLiteralType') return found
  if (MODULES.has(node.type)) {
    for (const [field, value] of Object.entries(node)) if (field !== 'source') literals(value, found, bindings)
    return found
  }
  // A property's name is the code's; its value is what may be said.
  if (node.type === 'Property' && !node.computed) return literals(node.value, found, bindings)
  if (node.type === 'Literal' && typeof node.value === 'string') found.push({ start: node.start, end: node.end, says: [node.value] })
  if (node.type === 'TemplateLiteral')
    found.push({ start: node.start, end: node.end, says: node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw) })
  for (const value of Object.values(node)) literals(value, found, bindings)
  return found
}

/**
 * Find the keys a module spells in its words.
 * @param {string} path - the file's path.
 * @param {string} text - the file's text.
 * @returns {string[]} one line per literal that names a key, with its 1-based line, the literal as written, the first key it names, and what to change.
 */
export function spelledKeys(path, text) {
  const { program } = parseSync(path, text)
  const lineOf = (offset) => text.slice(0, offset).split('\n').length
  return literals(program).flatMap((literal) => {
    const key = literal.says.map((says) => KEY.exec(says)?.[0]).find((found) => found !== undefined)
    return key === undefined
      ? []
      : [
          `${path}:${lineOf(literal.start)}: ${text.slice(literal.start, literal.end)} names the key ${key}; a plugin spells no key — which keys answer something is the key table's, and an ask names them on its edge — so say what it does, and leave the key to the table`,
        ]
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter((file) => /^packages\/binnacle\/src\/plugins\/.*\.ts$/.test(file.path))
  const problems = files.flatMap((file) => spelledKeys(file.path, file.text))
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-words: ok (${files.length} modules)` : `check-words: ${problems.length} keys spelled`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
