#!/usr/bin/env node
// A tool's own dot-folder under home, such as ~/.dsh, is the same on every machine, so it passes.
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEAKS = [/\/Users\/[^/\s`'")\]]+\//g, /\/home\/[^/\s`'")\]]+\//g, /[A-Za-z]:\\Users\\[^\\\s`'")\]]+\\/g, /~\/[^.\s`'")\]/]/g]

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
