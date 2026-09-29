#!/usr/bin/env node
/**
 * Hold every source folder to a note saying what its files are for.
 *
 * Every folder under `packages/binnacle/src/`, `src/` included, holds an
 * `AGENTS.md` whose bullets before the first `## ` heading each begin with a
 * backticked name and together name every `.ts` file and subfolder (with a
 * trailing `/`) directly in it, and nothing else. Later sections are free text.
 * @module binnacle/scripts/check-folder-notes
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repositoryFiles } from './check-paths.mjs'

const SRC = 'packages/binnacle/src'

/**
 * The folder a file sits in.
 * @param {string} path - the file's path.
 * @returns {string} the path without its last segment.
 */
function folderOf(path) {
  return path.slice(0, path.lastIndexOf('/'))
}

/**
 * Every folder that holds a file, with each folder above it down to `src`.
 * @param {{ path: string }[]} files - the files.
 * @returns {string[]} the folders, sorted.
 */
function foldersOf(files) {
  const folders = new Set([SRC])
  for (const file of files) {
    for (let folder = folderOf(file.path); folder.length > SRC.length; folder = folderOf(folder)) folders.add(folder)
  }
  return [...folders].toSorted()
}

/**
 * What a folder holds that a note must name.
 * @param {{ path: string }[]} files - the files.
 * @param {string} folder - the folder.
 * @returns {string[]} its `.ts` files, then its subfolders as `name/`, each sorted.
 */
function heldBy(files, folder) {
  const below = files.map(file => file.path).filter(path => path.startsWith(`${folder}/`)).map(path => path.slice(folder.length + 1).split('/'))
  const modules = below.filter(parts => parts.length === 1 && parts[0].endsWith('.ts')).map(parts => parts[0])
  const folders = below.filter(parts => parts.length > 1).map(parts => `${parts[0]}/`)
  return [...new Set(modules)].toSorted().concat([...new Set(folders)].toSorted())
}

/**
 * The files and folders a note names.
 * @param {string} text - the note's text.
 * @returns {string[]} the name in each bullet that starts with a backticked name, in order, before the first `## ` heading; a folder keeps its trailing `/`.
 */
function named(text) {
  const names = []
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) break
    const match = /^- `([^`]+)`/.exec(line)
    if (match) names.push(match[1])
  }
  return names
}

/**
 * Find what the folder notes under `src` leave wrong.
 * @param {{ path: string, text: string }[]} files - every repository file under `packages/binnacle/src/`, the `AGENTS.md` notes among them.
 * @returns {string[]} one line per problem, ordered by folder, then a folder's missing lines before its stale ones.
 */
export function checkFolderNotes(files) {
  const problems = []
  for (const folder of foldersOf(files)) {
    const note = files.find(file => file.path === `${folder}/AGENTS.md`)
    if (note === undefined) {
      problems.push(`${folder}: no AGENTS.md — add one saying in a line what each file here is for`)
      continue
    }
    const says = named(note.text)
    const held = heldBy(files, folder)
    for (const name of held) {
      if (!says.includes(name)) problems.push(`${note.path}: says nothing of ${name} — add a line for it`)
    }
    for (const name of says) {
      if (!held.includes(name)) problems.push(`${note.path}: names ${name}, which is not here — remove its line`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = repositoryFiles(root).filter(file => file.path.startsWith(`${SRC}/`) && (file.path.endsWith('.ts') || file.path.endsWith('/AGENTS.md')))
  const problems = checkFolderNotes(files)
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-folder-notes: ok (${foldersOf(files).length} folders)` : `check-folder-notes: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
