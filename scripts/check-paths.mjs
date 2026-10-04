#!/usr/bin/env node
/**
 * Refuse a path that belongs to one machine in any file this repository
 * tracks or is about to.
 *
 * A home directory names a person and a layout nobody else has: an absolute
 * home (macOS, Linux or Windows) and a home-relative path into it are both
 * refused. A tool's own dot-directory under home (`~/.dsh`, `~/.config`) is
 * the same on every machine and passes. Where another repository is meant,
 * cite it through the references (`pi:packages/tui/src/tui.ts`) instead.
 * @module binnacle/scripts/check-paths
 */
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEAKS = [/\/Users\/[^/\s`'")\]]+\//g, /\/home\/[^/\s`'")\]]+\//g, /[A-Za-z]:\\Users\\[^\\\s`'")\]]+\\/g, /~\/[^.\s`'")\]/]/g]

/**
 * Find every machine-local path in a set of files.
 * @param {{ path: string, text: string }[]} files - the files and their text.
 * @returns {{ path: string, line: number, found: string }[]} each leak, by file and 1-based line.
 */
export function findLeaks(files) {
  const leaks = []
  for (const file of files) {
    file.text.split('\n').forEach((line, index) => {
      for (const pattern of LEAKS) {
        for (const match of line.matchAll(pattern)) leaks.push({ path: file.path, line: index + 1, found: match[0] })
      }
    })
  }
  return leaks
}

/**
 * The text files git tracks or would add, at a repository root.
 * @param {string} root - the repository root.
 * @returns {{ path: string, text: string }[]} each file's path and text; binaries are left out. A symlink's text is the
 * link itself, which is what git stores, never what it points at, which may be absent or outside the repository.
 */
export function repositoryFiles(root) {
  const listed = execFileSync('git', ['-C', root, 'ls-files', '-z', '-co', '--exclude-standard'], { encoding: 'utf8' })
  return listed
    .split('\0')
    .filter(Boolean)
    .flatMap((path) => {
      let text
      try {
        const at = join(root, path)
        text = lstatSync(at).isSymbolicLink() ? readlinkSync(at, 'utf8') : readFileSync(at, 'utf8')
      } catch {
        // Listed and since deleted from the worktree: nothing to read.
        return []
      }
      return text.includes('\0') ? [] : [{ path, text }]
    })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const leaks = findLeaks(repositoryFiles(join(dirname(fileURLToPath(import.meta.url)), '..')))
  for (const leak of leaks) console.error(`${leak.path}:${leak.line}: ${leak.found} is one machine's path`)
  console.log(leaks.length === 0 ? 'check-paths: ok' : `check-paths: ${leaks.length} machine-local paths`)
  process.exitCode = leaks.length === 0 ? 0 : 1
}
