#!/usr/bin/env node
/**
 * Read what each upstream has released past the pin.
 *
 * A reference pinned at a tag follows that tag's release line: the tags
 * sharing its prefix (`dsh-v`, `v`). This lists every release on the line
 * newer than the pin, read live from the reference's public url, and whether
 * the branch that would carry it — `upstream/<name>/<version>`, written by
 * the scheduled upstream job — is on this repository's `origin`, and which
 * packages the move would take that npm does not list at the release yet: a
 * release is tagged before it is published, and the job waits for both. It
 * reads and never moves a pin; moving one is `pnpm pin`, and a decision.
 *
 * `pnpm upstream` prints the reading; `--json` prints it for the job.
 * @module binnacle/scripts/upstream
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = /(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/

/**
 * Split a tag into its release line and version.
 * @param {string} tag - a tag ending in a version, like `dsh-v0.1.7-rc.2`.
 * @returns {{ prefix: string, version: string } | undefined} the prefix before the version and the version; undefined when the tag ends in none.
 */
export function splitTag(tag) {
  const match = VERSION.exec(tag)
  return match === null ? undefined : { prefix: tag.slice(0, match.index), version: match[0] }
}

/**
 * Order two versions as semver does: by number, a prerelease before its release, prerelease fields numerically where both are numbers.
 * @param {string} a - a version, like `0.1.7-rc.2`.
 * @param {string} b - another.
 * @returns {number} negative when `a` is older, positive when newer, zero when equal.
 */
export function compareVersions(a, b) {
  const [, ...left] = VERSION.exec(a) ?? []
  const [, ...right] = VERSION.exec(b) ?? []
  for (let i = 0; i < 3; i++) {
    const order = Number(left[i]) - Number(right[i])
    if (order !== 0) return order
  }
  if (left[3] === right[3]) return 0
  if (left[3] === undefined) return 1
  if (right[3] === undefined) return -1
  const x = left[3].split('.')
  const y = right[3].split('.')
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1
    if (y[i] === undefined) return 1
    const numeric = /^\d+$/.test(x[i]) && /^\d+$/.test(y[i])
    const order = numeric ? Number(x[i]) - Number(y[i]) : x[i].localeCompare(y[i])
    if (order !== 0) return order
  }
  return 0
}

/**
 * The releases on a pin's line that are newer than it.
 * @param {string} pinned - the tag the reference is pinned at.
 * @param {string[]} tags - every tag upstream has.
 * @returns {string[]} the newer tags on the same line, oldest first.
 */
export function releasesAfter(pinned, tags) {
  const pin = splitTag(pinned)
  if (pin === undefined) return []
  return tags
    .map((tag) => ({ tag, split: splitTag(tag) }))
    .filter(({ split }) => split?.prefix === pin.prefix && compareVersions(split.version, pin.version) > 0)
    .toSorted((a, b) => compareVersions(a.split.version, b.split.version))
    .map(({ tag }) => tag)
}

/**
 * The packages a pin's move would take to a release that npm does not list at it yet.
 * @param {Record<string, string>} deps - the dependencies declared, each with its version.
 * @param {string} name - the reference moving: `dsh` or `pi`.
 * @param {string} version - the release's version.
 * @param {(pkg: string) => string[]} versionsOf - every version npm lists for a package.
 * @returns {string[]} each package still to be published, in declaration order.
 */
export function unpublished(deps, name, version, versionsOf) {
  return Object.keys(deps).filter((dep) => follows(name, dep) && !versionsOf(dep).includes(version))
}

/**
 * Whether a package takes a reference's release version when its pin moves.
 * @param {string} name - the reference: `dsh` or `pi`.
 * @param {string} dep - the package.
 * @returns {boolean} true for every dsh package when dsh moves, and pi-tui when pi does.
 */
export function follows(name, dep) {
  return name === 'dsh' ? dep.startsWith('@deepseek-ai/dsh-') : name === 'pi' && dep === '@earendil-works/pi-tui'
}

/**
 * The branch the upstream job carries a release on.
 * @param {string} name - the reference's name.
 * @param {string} tag - the release's tag.
 * @returns {string} `upstream/<name>/<version>`.
 */
export function mailBranch(name, tag) {
  return `upstream/${name}/${splitTag(tag)?.version ?? tag}`
}

/**
 * Run git and return its stdout.
 * @param {string[]} args - the arguments.
 * @returns {string} what git printed.
 */
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/**
 * Every version npm lists for a package.
 * @param {string} pkg - the package.
 * @returns {string[]} its versions; none for a package npm has never published.
 */
const versionsOf = (pkg) => {
  try {
    return JSON.parse(execFileSync('npm', ['view', pkg, 'versions', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch {
    // npm answers a package it has never published with an error.
    return []
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8'))
  let branches = []
  try {
    branches = git(['-C', root, 'ls-remote', '--heads', 'origin', 'refs/heads/upstream/*'])
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')[1].replace('refs/heads/', ''))
  } catch {
    // No origin, or no network to it: every release reads as not yet carried.
  }
  const deps = Object.assign(
    {},
    ...['package.json', join('packages', 'binnacle', 'package.json')]
      .flatMap((file) => {
        const pkg = JSON.parse(readFileSync(join(root, file), 'utf8'))
        return [pkg.dependencies, pkg.peerDependencies, pkg.devDependencies]
      })
      .filter(Boolean),
  )
  const reading = Object.entries(manifest)
    .filter(([, ref]) => ref.tag !== undefined)
    .map(([name, ref]) => {
      const tags = git(['ls-remote', '--tags', '--refs', ref.url])
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t')[1].replace('refs/tags/', ''))
      const newer = releasesAfter(ref.tag, tags)
      const newest = newer.at(-1)
      const branch = newest === undefined ? undefined : mailBranch(name, newest)
      const waiting = newest === undefined ? [] : unpublished(deps, name, splitTag(newest)?.version ?? newest, versionsOf)
      return { name, pinned: ref.tag, newer, newest, branch, carried: branch !== undefined && branches.includes(branch), waiting }
    })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(reading))
  } else {
    for (const ref of reading) {
      if (ref.newest === undefined) console.log(`${ref.name}: ${ref.pinned}, the newest release`)
      else if (ref.carried) console.log(`${ref.name}: ${ref.pinned}; newer: ${ref.newer.join(', ')} — ${ref.branch} carries ${ref.newest}`)
      else if (ref.waiting.length > 0)
        console.log(`${ref.name}: ${ref.pinned}; newer: ${ref.newer.join(', ')} — ${ref.newest} waits on npm for ${ref.waiting.join(', ')}`)
      else console.log(`${ref.name}: ${ref.pinned}; newer: ${ref.newer.join(', ')} — ${ref.newest} not carried yet`)
    }
  }
}
