#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SCHEMA, load, Type } from 'js-yaml'

const CORE = 'binnacle'

function featureRows(patch) {
  const inserted = (load(patch, { schema: DSH_SCHEMA }) ?? []).flatMap((entry) => entry.insert ?? [])
  // A row that names a dsh package composes dsh's own plugin; a feature of binnacle's is a plugin of its own.
  return inserted
    .filter((row) => !String(row.name ?? '').startsWith('@'))
    .map((row) => row.id)
    .filter((id) => id !== CORE)
}

const cellsOf = (line) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())

function mappedRows(map) {
  const lines = map.split('\n').filter((line) => line.startsWith('|'))
  const column = cellsOf(lines[0] ?? '').indexOf('Row')
  return lines.slice(2).flatMap((line) => /^`([^`]+)`$/.exec(cellsOf(line)[column] ?? '')?.[1] ?? [])
}

// dsh evaluates a `!!js` value at load; the check reads only the rows, so it keeps the source.
const DSH_SCHEMA = DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind: 'scalar' })])

export function findProblems(patch, map) {
  const rows = featureRows(patch)
  const mapped = mappedRows(map)
  return [
    ...rows.filter((id) => !mapped.includes(id)).map((id) => `${id} is a row of the bundle with no row in docs/features.md; add one`),
    ...mapped
      .filter((id) => !rows.includes(id))
      .map((id) => `${id} is in docs/features.md, but the bundle inserts no such row; remove it, or add the row`),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const read = (path) => readFileSync(join(root, path), 'utf8')
  const problems = findProblems(read('packages/binnacle/cordis.patch.yml'), read('docs/features.md'))
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? 'check-features: ok' : `check-features: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
