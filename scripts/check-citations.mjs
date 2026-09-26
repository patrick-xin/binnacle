#!/usr/bin/env node
/**
 * Resolve every citation of a reference against the commit it is pinned to.
 *
 * A citation is a reference name, a colon and a path, in backticks:
 * `` `pi:packages/tui/src/tui.ts` ``, optionally with `#symbol` after it. It
 * names no commit: the pin in `references.json` is the version, so moving a
 * pin re-reads every citation, and one whose file is gone fails here.
 *
 * A reference only this machine declares is skipped where it is not fetched,
 * which is everywhere but here; a public one that is not fetched fails.
 * @module binnacle/scripts/check-citations
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repositoryFiles } from './check-paths.mjs'
import { fetchedAt, references } from './refs.mjs'

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Find the citations in one text.
 * @param {string} text - the text.
 * @param {string[]} names - the reference names that make a citation.
 * @returns {{ name: string, path: string, line: number }[]} each citation, with its 1-based line.
 */
export function findCitations(text, names) {
  if (names.length === 0) return []
  const pattern = new RegExp('`(' + names.map(escape).join('|') + '):([^`\\s#]+)(?:#[^`\\s]*)?`', 'g')
  return text.split('\n').flatMap((line, index) =>
    [...line.matchAll(pattern)].map(match => ({ name: match[1], path: match[2], line: index + 1 })))
}

/**
 * Check every citation in a set of files.
 * @param {{ path: string, text: string }[]} files - the files and their text.
 * @param {Record<string, { commit: string, local?: boolean }>} manifest - each reference's pin, and whether only this machine has it.
 * @param {(name: string, path: string) => boolean | undefined} exists - whether a path is in a reference at its pin; undefined when the reference is not fetched.
 * @returns {{ problems: string[], skipped: number }} one line per failing citation, and how many were skipped as unfetched and local.
 */
export function checkCitations(files, manifest, exists) {
  const problems = []
  let skipped = 0
  for (const file of files) {
    for (const citation of findCitations(file.text, Object.keys(manifest))) {
      const ref = manifest[citation.name]
      const found = exists(citation.name, citation.path)
      const where = `${file.path}:${citation.line}`
      if (found === undefined) {
        if (ref.local) skipped += 1
        else problems.push(`${where}: ${citation.name} is not fetched; run \`pnpm refs\``)
      } else if (!found) {
        problems.push(`${where}: ${citation.name}:${citation.path} is not at ${ref.commit.slice(0, 10)}`)
      }
    }
  }
  return { problems, skipped }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const refs = references(root)
  const manifest = Object.fromEntries(refs.map(ref => [ref.name, ref]))
  const stale = refs.flatMap(ref => {
    const at = fetchedAt(join(root, '.refs', ref.name))
    return at === undefined || at.startsWith(ref.commit) ? [] : [`${ref.name} is fetched at ${at.slice(0, 10)}, pinned ${ref.commit.slice(0, 10)}; run \`pnpm refs\``]
  })
  const exists = (name, path) => {
    const dir = join(root, '.refs', name)
    if (fetchedAt(dir) === undefined) return undefined
    try {
      execFileSync('git', ['-C', dir, 'cat-file', '-e', `HEAD:${path.replace(/\/$/, '')}`], { stdio: 'ignore' })
      return true
    } catch {
      // cat-file exits non-zero for a path that is not in the tree.
      return false
    }
  }
  const { problems, skipped } = checkCitations(repositoryFiles(root), manifest, exists)
  for (const problem of [...stale, ...problems]) console.error(problem)
  const failed = stale.length + problems.length
  console.log(failed === 0 ? `check-citations: ok${skipped ? ` (${skipped} into unfetched local references skipped)` : ''}` : `check-citations: ${failed} problems`)
  process.exitCode = failed === 0 ? 0 : 1
}
