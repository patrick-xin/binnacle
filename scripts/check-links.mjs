#!/usr/bin/env node
/**
 * Resolve every relative link in the repository's Markdown.
 *
 * A link is resolved from the file that holds it, with any `#anchor` set
 * aside; a link to a website, a mail address or an anchor in the same page is
 * not checked. Links inside code spans and fenced blocks are text, not links.
 * A decision record is never edited to follow a move, so it links only other
 * records.
 * @module binnacle/scripts/check-links
 */
import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repositoryFiles } from './check-paths.mjs'

/** Where the decision records are, repository-relative. */
export const RECORDS = 'docs/adr/'

/**
 * The relative links in one Markdown text, outside code.
 * @param {string} text - the text.
 * @returns {{ target: string, line: number }[]} each link's path, its anchor set aside, and its 1-based line.
 */
function linksIn(text) {
  const links = []
  let fenced = false
  text.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) { fenced = !fenced; return }
    if (fenced) return
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (target !== '' && !/^[a-z]+:/i.test(target)) links.push({ target, line: index + 1 })
    }
  })
  return links
}

/**
 * Find every relative link that resolves to nothing, or leads out of a decision record.
 * @param {{ path: string, text: string }[]} files - the Markdown files and their text.
 * @param {(path: string) => boolean} exists - whether a repository-relative path exists.
 * @returns {string[]} one line per broken link, with its file and 1-based line.
 */
export function brokenLinks(files, exists) {
  return files.flatMap(file => linksIn(file.text).flatMap(({ target, line }) => {
    const resolved = normalize(join(dirname(file.path), target))
    if (!exists(resolved)) return [`${file.path}:${line}: ${target} does not exist`]
    if (file.path.startsWith(RECORDS) && !resolved.startsWith(RECORDS)) return [`${file.path}:${line}: ${target} is not a decision record; a record links only other records, and names the rest in words`]
    return []
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter(file => file.path.endsWith('.md'))
  const problems = brokenLinks(files, path => existsSync(join(root, path)))
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-links: ok (${files.length} files)` : `check-links: ${problems.length} broken`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
