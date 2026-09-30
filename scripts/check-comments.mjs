#!/usr/bin/env node
/**
 * Refuse a comment under `src/` that runs past two lines, or cites another repository, beyond its file's baseline.
 * @module binnacle/scripts/check-comments
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { findCitations, SELF } from './check-citations.mjs'
import { authorSurface } from './check-jsdoc.mjs'
import { repositoryFiles } from './check-paths.mjs'

/**
 * Find the comments in one module that say too much.
 * @param {string} path - the file's path.
 * @param {string} text - the file's text.
 * @param {string[]} [names] - the repositories a citation may name.
 * @param {readonly { line: number, end: number }[]} [read] - the lines of each declaration an author reads, whose JSDoc may run longer.
 * @returns {string[]} one line per comment refused, with its 1-based line.
 */
export function longComments(path, text, names = [], read = []) {
  const { comments } = parseSync(path, text)
  const lineOf = offset => text.slice(0, offset).split('\n').length
  const blocks = []
  for (const comment of comments) {
    const last = blocks.at(-1)
    const joins = comment.type === 'Line' && last?.type === 'Line' && /^[ \t]*\n[ \t]*$/.test(text.slice(last.end, comment.start))
    if (joins) blocks[blocks.length - 1] = { ...last, end: comment.end, value: `${last.value}\n${comment.value}` }
    else blocks.push({ type: comment.type, start: comment.start, end: comment.end, value: comment.value })
  }
  const problems = []
  for (const block of blocks) {
    const said = block.value.split('\n').filter(line => line.replace(/^[\s*]*/, '').trim() !== '').length
    const documents = lineOf(block.end + text.slice(block.end).search(/\S|$/))
    if (said > 2 && !(block.type === 'Block' && read.some(({ line, end }) => line <= documents && documents <= end))) problems.push(`${path}:${lineOf(block.start)}: ${said} lines`)
    for (const cited of new Set(findCitations(block.value, names).map(citation => citation.name))) problems.push(`${path}:${lineOf(block.start)}: cites ${cited}`)
  }
  return problems
}


/**
 * Hold each file to the comments its baseline records: never more, and a baseline above what is left is lowered.
 * @param {ReadonlyMap<string, string[]>} found - each file's refused comments.
 * @param {Readonly<Record<string, number>>} baseline - how many each file may keep.
 * @returns {string[]} the comments of each file over its baseline, and each baseline to lower.
 */
export function ratchet(found, baseline) {
  const problems = []
  for (const path of Object.keys(baseline)) if (!found.has(path)) problems.push(`${path}: the baseline holds ${baseline[path]}, and 0 are left: lower it`)
  for (const [path, refused] of found) {
    const kept = baseline[path] ?? 0
    if (refused.length > kept) problems.push(...refused)
    else if (refused.length < kept) problems.push(`${path}: the baseline holds ${kept}, and ${refused.length} are left: lower it`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const baselineFile = 'scripts/check-comments-baseline.json'
  const files = new Map(repositoryFiles(root).map(file => [file.path, file.text]))
  const names = [...Object.keys(JSON.parse(files.get('references.json'))), SELF]
  const read = new Map()
  for (const entry of [...files.keys()].filter(path => /^packages\/[^/]+\/src\/api\.ts$/.test(path))) {
    for (const { path, line, end } of authorSurface(entry, file => files.get(file) ?? '')) read.set(path, [...read.get(path) ?? [], { line, end }])
  }
  const sources = [...files.keys()].filter(path => /^packages\/[^/]+\/src\/.*\.ts$/.test(path))
  const found = new Map(sources.map(path => [path, longComments(path, files.get(path), names, read.get(path))]).filter(([, refused]) => refused.length > 0))
  const problems = ratchet(found, JSON.parse(readFileSync(join(root, baselineFile), 'utf8')))
  for (const problem of problems) {
    console.error(problem.includes('lower it') ? `${problem} in ${baselineFile}`
      : `${problem} — a comment says in a line or two why the code is as it is; make the rest a test, a name, or nothing, and cite no repository (AGENTS.md, *Code*)`)
  }
  console.log(problems.length === 0 ? `check-comments: ok (${sources.length} modules, ${[...found.values()].flat().length} under the baseline)` : `check-comments: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
