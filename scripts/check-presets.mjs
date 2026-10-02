#!/usr/bin/env node
/**
 * Hold binnacle's copied presets to dsh's at the pin, and the author preset
 * to `standard`'s rows.
 *
 * binnacle copies dsh's four web presets byte for byte, so a pin that moved
 * brings the new copies along only if a gate refuses a drifted one. The
 * author preset is `standard`'s plugin list plus its own two rows, so a row
 * it gained or lost is a decision that belongs to an issue, not to a copy
 * gone stale. Presets are parsed with the Loader's own YAML dialect, so a
 * `!!js` row compares as it is declared.
 * @module binnacle/scripts/check-presets
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

/** dsh's web presets binnacle copies, by the file it copies each into. */
const COPIES = ['standard.patch.yml', 'ptc.patch.yml', 'minimal.patch.yml', 'cordis.patch.yml']

/** The rows the author preset owns; every other row of its list is `standard`'s. */
const AUTHOR_ROWS = new Set(['skill-filesystem', 'tool-plugin-manager'])

/**
 * The plugin list one preset declaration inserts, as its patch file declares it.
 * @param {string} text - the patch file's YAML.
 * @param {string} id - the preset it must declare.
 * @returns {any[] | undefined} its `plugins` rows, or undefined when it declares no preset of that id.
 */
function pluginsOf(text, id) {
  for (const entry of load(text, { schema: entryListSchema }) ?? []) {
    for (const row of entry.insert ?? []) {
      if (row.config?.id === id) return row.config.plugins
    }
  }
  return undefined
}

/**
 * Check binnacle's preset files against dsh's at the pin.
 * @param {{ copies: Record<string, string>, upstream: Record<string, string>, author: string }} input - each copied preset's text by file, dsh's at the pin by file, and the author preset's text.
 * @returns {string[]} one line per missing or drifted copy, and per author row that left `standard`'s.
 */
export function checkPresets({ copies, upstream, author }) {
  const problems = []
  for (const file of COPIES) {
    if (copies[file] === undefined) {
      problems.push(`presets/${file} is not copied from dsh at the pin; copy it from dsh:packages/bundle/web-app/presets/${file}`)
      continue
    }
    if (copies[file] !== upstream[file]) {
      problems.push(`presets/${file} differs from dsh at the pin (dsh:packages/bundle/web-app/presets/${file}); copy the file again`)
    }
  }
  const standard = upstream['standard.patch.yml'] === undefined ? undefined : pluginsOf(upstream['standard.patch.yml'], 'standard')
  if (standard === undefined) return problems
  const plugins = pluginsOf(author, 'author')
  if (plugins === undefined) {
    problems.push('presets/author.patch.yml declares no preset named author; it is where the author preset lives')
    return problems
  }
  if (plugins.length !== standard.length) {
    problems.push(
      `presets/author.patch.yml holds ${plugins.length} rows; standard's at the pin holds ${standard.length}; rederive the author preset from presets/standard.patch.yml`,
    )
    return problems
  }
  for (const [index, row] of plugins.entries()) {
    const theirs = standard[index]
    if (row?.id !== theirs.id || (!AUTHOR_ROWS.has(row?.id) && !isDeepStrictEqual(row, theirs))) {
      problems.push(
        `presets/author.patch.yml: row ${index + 1} ${row?.id ?? '(unnamed)'} is not standard's at the pin; rederive the author preset from presets/standard.patch.yml`,
      )
    }
  }
  return problems
}

/**
 * Read one file's text, or undefined when it is not there.
 * @param {string} dir - the directory to read from.
 * @param {string} file - the file to read.
 * @returns {string | undefined} its text.
 */
function read(dir, file) {
  return existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const ours = join(root, 'packages', 'binnacle', 'presets')
  const theirs = join(root, '.refs', 'dsh', 'packages', 'bundle', 'web-app', 'presets')
  const problems =
    existsSync(theirs) === false
      ? ['dsh is not fetched; run `pnpm refs`']
      : checkPresets({
          copies: Object.fromEntries(COPIES.map((file) => [file, read(ours, file)])),
          upstream: Object.fromEntries(COPIES.map((file) => [file, read(theirs, file)])),
          author: read(ours, 'author.patch.yml') ?? '',
        })
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-presets: ok (${COPIES.length} copies + author)` : `check-presets: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
