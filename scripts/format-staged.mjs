#!/usr/bin/env node
/**
 * Choose which staged files the pre-commit hook offers oxfmt, so a commit
 * never carries unstaged edits in with a format: the choice is pure, and the
 * git and oxfmt calls around it run only when this file is the entry point.
 * @module binnacle/scripts/format-staged
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Which staged files to format, and which to leave alone because they carry unstaged edits.
 * @param {{ staged: readonly { status: string, path: string }[], unstaged: readonly string[], exists: (path: string) => boolean }} change - the staged entries git reports, the paths with unstaged edits, and what is on disk.
 * @returns {{ format: string[], skipped: string[] }} the paths to format, and the partially-staged ones left alone.
 */
export function select({ staged, unstaged, exists }) {
  const carried = new Set(unstaged)
  const format = []
  const skipped = []
  for (const entry of staged) {
    if (!'ACMR'.includes(entry.status)) continue
    if (!exists(entry.path)) continue
    if (carried.has(entry.path)) skipped.push(entry.path)
    else format.push(entry.path)
  }
  return { format, skipped }
}

/**
 * What is staged and what carries unstaged edits, read from `git status --porcelain=v1 -z`: a rename's or
 * copy's old path arrives as a bare record after the new, and is consumed, never parsed.
 * @param {string} listed - the status output, NUL-separated.
 * @returns {{ staged: { status: string, path: string }[], unstaged: string[] }} the staged entries, and the paths with unstaged edits.
 */
export function parseStatus(listed) {
  const staged = []
  const unstaged = []
  const records = listed.split('\0').filter(Boolean)
  for (let at = 0; at < records.length; at++) {
    const record = records[at]
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (status[0] === 'R' || status[0] === 'C') at++
    if (status[1] !== ' ' && status[1] !== '?') unstaged.push(path)
    if ('ACMR'.includes(status[0])) staged.push({ status: status[0], path })
  }
  return { staged, unstaged }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // CI commits its own prose (the upstream job's pin moves, changesets' version commits); the hook stands aside there, as pre-push does.
  if (process.env.GITHUB_ACTIONS) process.exit(0)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const { staged, unstaged } = parseStatus(execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '-z'], { encoding: 'utf8' }))
  const { format, skipped } = select({ staged, unstaged, exists: (path) => existsSync(join(root, path)) })
  for (const path of skipped) console.warn(`format-staged: ${path} is staged in part; stage it whole to format it`)
  if (format.length === 0) process.exit(0)
  const run = spawnSync('pnpm', ['exec', 'oxfmt', ...format], { stdio: 'inherit' })
  if (run.status === 2) process.exit(0)
  if (run.status !== 0) process.exit(run.status ?? 1)
  execFileSync('git', ['-C', root, 'add', '--', ...format])
}
