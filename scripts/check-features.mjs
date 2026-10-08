#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
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

function columnOf(map, name) {
  const lines = map.split('\n').filter((line) => line.startsWith('|'))
  const column = cellsOf(lines[0] ?? '').indexOf(name)
  return lines.slice(2).map((line) => cellsOf(line)[column] ?? '')
}

const mappedRows = (map) =>
  columnOf(map, 'Rows')
    .flatMap((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]))
    .filter((id) => id !== CORE)

const linkedDocs = (map) => columnOf(map, 'Doc').flatMap((cell) => /\]\(features\/([^)#]+)\)/.exec(cell)?.[1] ?? [])

function featuresOf(map) {
  const names = columnOf(map, 'Feature')
  const docs = columnOf(map, 'Doc')
  const code = columnOf(map, 'Code')
  return names.map((name, index) => ({
    name,
    doc: /\]\((features\/[^)#]+)\)/.exec(docs[index] ?? '')?.[1],
    paths: [...(code[index] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]),
  }))
}

/** `changed` are the files that the branch changes, and `messages` its commits' messages. */
export function staleDocs(changed, map, messages) {
  const features = featuresOf(map)
  const owner = (file) => {
    let best
    for (const feature of features)
      for (const path of feature.paths)
        if ((file === path || (path.endsWith('/') && file.startsWith(path))) && path.length > (best?.path.length ?? -1))
          best = { feature, path }
    return best?.feature
  }
  const stale = new Map()
  for (const file of changed) {
    const feature = owner(file)
    if (feature === undefined || feature.doc === undefined || stale.has(feature)) continue
    if (changed.includes(`docs/${feature.doc}`)) continue
    if (messages.includes(`Feature doc unchanged: ${feature.name},`)) continue
    stale.set(feature, file)
  }
  return [...stale].map(
    ([feature, file]) =>
      `${feature.name}: the branch changes ${file}, and not docs/${feature.doc}; say what is built now, or add \`Feature doc unchanged: ${feature.name}, <why>\` to a commit's message`,
  )
}

// dsh evaluates a `!!js` value at load; the check reads only the rows, so it keeps the source.
const DSH_SCHEMA = DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind: 'scalar' })])

/** `docs` are the file names in `docs/features/`. */
export function findProblems(patch, map, docs) {
  const rows = featureRows(patch)
  const mapped = mappedRows(map)
  const linked = linkedDocs(map)
  return [
    ...rows.filter((id) => !mapped.includes(id)).map((id) => `${id} is a row of the bundle with no row in docs/features.md; add one`),
    ...mapped
      .filter((id) => !rows.includes(id))
      .map((id) => `${id} is in docs/features.md, but the bundle inserts no such row; remove it, or add the row`),
    ...linked
      .filter((doc) => !docs.includes(doc))
      .map((doc) => `docs/features.md links features/${doc}, which does not exist; write it, or fix the link`),
    ...docs
      .filter((doc) => !linked.includes(doc))
      .map((doc) => `docs/features/${doc} is linked by no feature in docs/features.md; link it, or remove it`),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const read = (path) => readFileSync(join(root, path), 'utf8')
  const docs = readdirSync(join(root, 'docs', 'features')).filter((file) => file.endsWith('.md'))
  const map = read('docs/features.md')
  const problems = findProblems(read('packages/binnacle/cordis.patch.yml'), map, docs)
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const base = git('merge-base', 'origin/main', 'HEAD')
  if (base.status === 0) {
    const from = base.stdout.trim()
    const changed = git('diff', '--name-only', `${from}...HEAD`).stdout.split('\n').filter(Boolean)
    problems.push(...staleDocs(changed, map, git('log', '--format=%B', `${from}..HEAD`).stdout))
  } else {
    console.log('check-features: no origin/main, so the feature docs are not checked against the branch')
  }
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? 'check-features: ok' : `check-features: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
