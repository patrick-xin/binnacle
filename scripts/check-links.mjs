#!/usr/bin/env node
// A decision record is never edited after a file moves, so it may link only other records.
import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repositoryFiles } from './check-paths.mjs'

export const RECORDS = 'docs/adr/'

function linksIn(text) {
  const links = []
  let fenced = false
  text.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced
      return
    }
    if (fenced) return
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (target !== '' && !/^[a-z]+:/i.test(target)) links.push({ target, line: index + 1 })
    }
  })
  return links
}

export function brokenLinks(files, exists) {
  return files.flatMap((file) =>
    linksIn(file.text).flatMap(({ target, line }) => {
      const resolved = normalize(join(dirname(file.path), target))
      if (!exists(resolved)) return [`${file.path}:${line}: ${target} does not exist`]
      if (file.path.startsWith(RECORDS) && !resolved.startsWith(RECORDS))
        return [`${file.path}:${line}: ${target} is not a decision record; a record links only other records, and names the rest in words`]
      return []
    }),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter((file) => file.path.endsWith('.md'))
  const problems = brokenLinks(files, (path) => existsSync(join(root, path)))
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-links: ok (${files.length} files)` : `check-links: ${problems.length} broken`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
