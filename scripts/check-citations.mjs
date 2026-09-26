#!/usr/bin/env node
/**
 * Resolve every citation — of a reference at the commit it is pinned to, and
 * of this repository as it stands.
 *
 * A citation is a name, a colon and a path, in backticks:
 * `` `pi:packages/tui/src/tui.ts` ``, optionally with `#symbol` after it. A
 * reference's citation names no commit: the pin in `references.json` is the
 * version, so moving a pin re-reads every citation, and one whose file is
 * gone fails here. This repository is cited as `binnacle`, so a document
 * that points at code fails when the code moves.
 *
 * A symbol is checked as text: in a reference, and in this repository's
 * prose, it must be written in the file as a whole word, which catches a
 * rename but not a declaration that went while a mention stayed. In this
 * repository's TypeScript and JavaScript it must be a name the module exports,
 * its star re-exports followed.
 *
 * A reference only this machine declares is skipped where it is not fetched,
 * which is everywhere but here; a public one that is not fetched fails.
 * @module binnacle/scripts/check-citations
 */
import { execFileSync } from 'node:child_process'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { repositoryFiles } from './check-paths.mjs'
import { fetchedAt, references } from './refs.mjs'

/** The name this repository is cited by. */
export const SELF = 'binnacle'

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CODE = /\.[cm]?[jt]sx?$/

/**
 * Find the citations in one text.
 * @param {string} text - the text.
 * @param {string[]} names - the names that make a citation.
 * @returns {{ name: string, path: string, symbol?: string, line: number }[]} each citation, with its 1-based line; `symbol` only where it names one.
 */
export function findCitations(text, names) {
  if (names.length === 0) return []
  const pattern = new RegExp('`(' + names.map(escape).join('|') + '):([^`\\s#]+)(?:#([^`\\s]*))?`', 'g')
  return text.split('\n').flatMap((line, index) =>
    [...line.matchAll(pattern)].map(match => ({ name: match[1], path: match[2], ...match[3] ? { symbol: match[3] } : {}, line: index + 1 })))
}

/**
 * The names a module exports, following its star re-exports through this repository.
 * @param {string} path - the module's path.
 * @param {string} text - the module's text.
 * @param {(path: string) => string | null} read - another module's text, by path; null when it is not there.
 * @param {Set<string>} seen - the modules already followed, so a cycle ends.
 * @returns {Set<string>} every name it exports; a star re-export carries every name but `default`.
 */
function exportsOf(path, text, read, seen = new Set([path])) {
  const names = new Set()
  for (const entry of parseSync(path, text).module.staticExports.flatMap(item => item.entries)) {
    if (entry.exportName.kind === 'Name') names.add(entry.exportName.name)
    else if (entry.exportName.kind === 'Default') names.add('default')
    else if (entry.moduleRequest?.value.startsWith('.')) {
      const target = posix.normalize(posix.join(posix.dirname(path), entry.moduleRequest.value))
      const found = seen.has(target) ? null : read(target)
      seen.add(target)
      if (found !== null) for (const name of exportsOf(target, found, read, seen)) if (name !== 'default') names.add(name)
    }
  }
  return names
}

/**
 * Check every citation in a set of files.
 * @param {{ path: string, text: string }[]} files - the files and their text.
 * @param {Record<string, { commit?: string, local?: boolean, self?: boolean }>} manifest - each name cited by: a reference's pin and whether only this machine has it, or `self` for this repository.
 * @param {(name: string, path: string) => string | null | undefined} read - a cited file's text, empty for a directory; null when the path is not there; undefined when the reference is not fetched.
 * @returns {{ problems: string[], skipped: number }} one line per failing citation, and how many were skipped as unfetched and local.
 */
export function checkCitations(files, manifest, read) {
  const problems = []
  let skipped = 0
  for (const file of files) {
    for (const citation of findCitations(file.text, Object.keys(manifest))) {
      const ref = manifest[citation.name]
      const text = read(citation.name, citation.path)
      const where = `${file.path}:${citation.line}`
      const cited = `${citation.name}:${citation.path}`
      if (text === undefined) {
        if (ref.local) skipped += 1
        else problems.push(`${where}: ${citation.name} is not fetched; run \`pnpm refs\``)
      } else if (text === null) {
        problems.push(ref.self ? `${where}: ${cited} is not in this repository` : `${where}: ${cited} is not at ${ref.commit.slice(0, 10)}`)
      } else if (citation.symbol !== undefined) {
        const exported = ref.self === true && CODE.test(citation.path)
        const pin = ref.self ? '' : ` at ${ref.commit.slice(0, 10)}`
        const held = exported
          ? exportsOf(citation.path, text, path => read(citation.name, path) ?? null).has(citation.symbol)
          : new RegExp(`(?<![\\w$])${escape(citation.symbol)}(?![\\w$])`).test(text)
        if (!held) problems.push(`${where}: ${cited} ${exported ? 'does not export' : 'has no'} ${citation.symbol}${pin}`)
      }
    }
  }
  return { problems, skipped }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const refs = references(root)
  const files = repositoryFiles(root)
  const manifest = { ...Object.fromEntries(refs.map(ref => [ref.name, ref])), [SELF]: { self: true } }
  const clash = refs.some(ref => ref.name === SELF) ? [`references.json names ${SELF}, the name this repository is cited by; rename the reference`] : []
  const stale = refs.flatMap(ref => {
    const at = fetchedAt(join(root, '.refs', ref.name))
    return at === undefined || at.startsWith(ref.commit) ? [] : [`${ref.name} is fetched at ${at.slice(0, 10)}, pinned ${ref.commit.slice(0, 10)}; run \`pnpm refs\``]
  })
  const own = new Map(files.map(file => [file.path, file.text]))
  const read = (name, path) => {
    const bare = path.replace(/\/$/, '')
    if (name === SELF) return own.get(bare) ?? (files.some(file => file.path.startsWith(`${bare}/`)) ? '' : null)
    const dir = join(root, '.refs', name)
    if (fetchedAt(dir) === undefined) return undefined
    try {
      return execFileSync('git', ['-C', dir, 'show', `HEAD:${bare}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      // git show exits non-zero for a path that is not in the tree.
      return null
    }
  }
  const { problems, skipped } = checkCitations(files, manifest, read)
  for (const problem of [...clash, ...stale, ...problems]) console.error(problem)
  const failed = clash.length + stale.length + problems.length
  console.log(failed === 0 ? `check-citations: ok${skipped ? ` (${skipped} into unfetched local references skipped)` : ''}` : `check-citations: ${failed} problems`)
  process.exitCode = failed === 0 ? 0 : 1
}
