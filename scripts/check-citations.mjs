#!/usr/bin/env node
// A reference's citation names no commit: the pin in references.json is the version, so a moved pin re-checks every citation.
// A symbol is checked as a whole word: that catches a rename, but not a declaration removed while a mention stays.
// A decision record cites nothing, so it can be read alone years later.
import { execFileSync } from 'node:child_process'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { RECORDS } from './check-links.mjs'
import { repositoryFiles } from './check-paths.mjs'
import { fetchedAt, references } from './refs.mjs'

export const SELF = 'binnacle'

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CODE = /\.[cm]?[jt]sx?$/

export function findCitations(text, names) {
  if (names.length === 0) return []
  const pattern = new RegExp('`(' + names.map(escape).join('|') + '):([^`\\s#]+)(?:#([^`\\s]*))?`', 'g')
  return text.split('\n').flatMap((line, index) =>
    [...line.matchAll(pattern)].map((match) => ({
      name: match[1],
      path: match[2],
      ...(match[3] ? { symbol: match[3] } : {}),
      line: index + 1,
    })),
  )
}

function exportsOf(path, text, read, seen = new Set([path])) {
  const names = new Set()
  for (const entry of parseSync(path, text).module.staticExports.flatMap((item) => item.entries)) {
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

export function checkCitations(files, manifest, read) {
  const problems = []
  let skipped = 0
  for (const file of files) {
    for (const citation of findCitations(file.text, Object.keys(manifest))) {
      const ref = manifest[citation.name]
      const where = `${file.path}:${citation.line}`
      const cited = `${citation.name}:${citation.path}`
      if (file.path.startsWith(RECORDS)) {
        problems.push(
          `${where}: ${cited} is cited in a decision record, which stands on its own; say what forced it in its own words, and put the reading on its issue`,
        )
        continue
      }
      const text = read(citation.name, citation.path)
      if (text === undefined) {
        if (ref.local) skipped += 1
        else problems.push(`${where}: ${citation.name} is not fetched; run \`pnpm refs\``)
      } else if (text === null) {
        problems.push(ref.self ? `${where}: ${cited} is not in this repository` : `${where}: ${cited} is not at ${ref.commit.slice(0, 10)}`)
      } else if (citation.symbol !== undefined) {
        const exported = ref.self === true && CODE.test(citation.path)
        const pin = ref.self ? '' : ` at ${ref.commit.slice(0, 10)}`
        const held = exported
          ? exportsOf(citation.path, text, (path) => read(citation.name, path) ?? null).has(citation.symbol)
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
  const manifest = { ...Object.fromEntries(refs.map((ref) => [ref.name, ref])), [SELF]: { self: true } }
  const clash = refs.some((ref) => ref.name === SELF)
    ? [`references.json names ${SELF}, the name this repository is cited by; rename the reference`]
    : []
  const stale = refs.flatMap((ref) => {
    const at = fetchedAt(join(root, '.refs', ref.name))
    return at === undefined || at.startsWith(ref.commit)
      ? []
      : [`${ref.name} is fetched at ${at.slice(0, 10)}, pinned ${ref.commit.slice(0, 10)}; run \`pnpm refs\``]
  })
  const own = new Map(files.map((file) => [file.path, file.text]))
  const read = (name, path) => {
    const bare = path.replace(/\/$/, '')
    if (name === SELF) return own.get(bare) ?? (files.some((file) => file.path.startsWith(`${bare}/`)) ? '' : null)
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
  console.log(
    failed === 0
      ? `check-citations: ok${skipped ? ` (${skipped} into unfetched local references skipped)` : ''}`
      : `check-citations: ${failed} problems`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}
