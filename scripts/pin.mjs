#!/usr/bin/env node
/**
 * Move a reference's pin to a release, and every package that follows it.
 *
 * `pnpm pin <name> <tag>` resolves the tag's commit on the reference's public
 * url, writes it into `references.json`, fetches the reference there, moves
 * the packages the pin governs — for `dsh`, every dsh package to the release
 * and every other `@deepseek-ai` package to what dsh vendors at it; for `pi`,
 * pi-tui — and reinstalls. It decides nothing: `pnpm test` afterwards is the
 * reading of what the move broke.
 * @module binnacle/scripts/pin
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vendoredBy } from './check-pins.mjs'
import { taggedCommit } from './refs.mjs'
import { splitTag } from './upstream.mjs'

/**
 * Move one reference in `references.json` to a tag.
 * @param {Record<string, { url: string, commit: string, tag?: string }>} manifest - `references.json`.
 * @param {string} name - the reference to move.
 * @param {string} tag - the release to move it to.
 * @param {string} commit - the commit that tag names.
 * @returns {Record<string, { url: string, commit: string, tag?: string }>} the manifest with that reference moved.
 * @throws when the reference is pinned by commit alone, so it follows no release line.
 */
export function movePin(manifest, name, tag, commit) {
  const ref = manifest[name]
  if (ref?.tag === undefined) throw new Error(`${name}: pinned by commit alone; edit references.json`)
  return { ...manifest, [name]: { ...ref, commit, tag } }
}

/**
 * Move the dependencies a reference's pin governs.
 * @param {Record<string, string>} deps - one block of dependencies and their versions.
 * @param {string} name - the reference moved: `dsh` or `pi`.
 * @param {string} version - the version its tag names.
 * @param {Record<string, string>} vendored - each package dsh vendors at the new pin; read only when `dsh` moves.
 * @returns {Record<string, string>} the block with every governed package moved.
 * @throws when dsh moves and a declared `@deepseek-ai` package is one it no longer vendors.
 */
export function moveDeps(deps, name, version, vendored) {
  return Object.fromEntries(Object.entries(deps).map(([dep, pinned]) => {
    if (name === 'pi' && dep === '@earendil-works/pi-tui') return [dep, version]
    if (name !== 'dsh' || !dep.startsWith('@deepseek-ai/')) return [dep, pinned]
    if (dep.startsWith('@deepseek-ai/dsh-')) return [dep, version]
    if (!(dep in vendored)) throw new Error(`${dep}: dsh at ${version} vendors no such package; drop it or read why`)
    return [dep, vendored[dep]]
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const [name, tag] = process.argv.slice(2)
  const version = tag === undefined ? undefined : splitTag(tag)?.version
  if (name === undefined || version === undefined) throw new Error('usage: pnpm pin <name> <tag>, as `pnpm upstream` lists them')
  const refsFile = join(root, 'references.json')
  const manifest = JSON.parse(readFileSync(refsFile, 'utf8'))
  const url = manifest[name]?.url
  if (url === undefined) throw new Error(`${name}: not a reference`)
  const commit = taggedCommit(execFileSync('git', ['ls-remote', url, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' }))
  if (commit === undefined) throw new Error(`${name}: ${url} has no tag ${tag}`)
  writeFileSync(refsFile, `${JSON.stringify(movePin(manifest, name, tag, commit), null, 2)}\n`)
  execFileSync('node', [join(root, 'scripts', 'refs.mjs'), name], { stdio: 'inherit' })
  const vendored = name === 'dsh' ? vendoredBy(join(root, '.refs', 'dsh')) ?? {} : {}
  for (const file of [join(root, 'package.json'), join(root, 'packages', 'binnacle', 'package.json')]) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    for (const block of ['dependencies', 'peerDependencies', 'devDependencies']) {
      if (pkg[block] !== undefined) pkg[block] = moveDeps(pkg[block], name, version, vendored)
    }
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  }
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root, stdio: 'inherit' })
  console.log(`pin: ${name} is at ${tag} (${commit.slice(0, 10)}); run \`pnpm test\` for what it broke`)
}
