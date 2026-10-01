#!/usr/bin/env node
/**
 * Refuse a placeholder a privacy tool put where a value stood, in any file this
 * repository tracks or is about to.
 *
 * An agent's harness may show it a value — an address, an owner's name, a
 * secret — as a placeholder, and an agent that writes what it was shown writes
 * the placeholder: the link it was part of breaks, and the value it stood for
 * is lost. Read the value from where it lives (the remote, the history) instead.
 * @module binnacle/scripts/check-placeholders
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repositoryFiles } from './check-paths.mjs'

// Built from parts, so this file holds no placeholder of its own.
const PLACEHOLDER = new RegExp(String.raw`\[` + 'REDACTED' + String.raw`:[\w-]+\]`, 'g')

/**
 * Find every privacy placeholder in a set of files.
 * @param {{ path: string, text: string }[]} files - the files and their text.
 * @returns {{ path: string, line: number, found: string }[]} each placeholder, by file and 1-based line.
 */
export function findPlaceholders(files) {
  const found = []
  for (const file of files) {
    file.text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(PLACEHOLDER)) found.push({ path: file.path, line: index + 1, found: match[0] })
    })
  }
  return found
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = findPlaceholders(repositoryFiles(join(dirname(fileURLToPath(import.meta.url)), '..')))
  for (const each of found)
    console.error(
      `${each.path}:${each.line}: ${each.found} is a privacy tool's placeholder; write the value it stood for, read from where it lives`,
    )
  console.log(found.length === 0 ? 'check-placeholders: ok' : `check-placeholders: ${found.length} placeholders`)
  process.exitCode = found.length === 0 ? 0 : 1
}
