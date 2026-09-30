#!/usr/bin/env node
/**
 * The references: every repository an agent reads here and never writes,
 * fetched under `.refs/<name>` at the commit `references.json` pins.
 *
 * `references.json` is public and names each reference by url and pin.
 * `references.local.json` is this machine's and ignored: it may point a
 * public reference at a local clone, which fetches faster and never moves the
 * pin, and it may add references of its own, which only this machine reads.
 *
 * `pnpm refs` fetches them all; `pnpm refs pi dsh` fetches the ones named.
 * @module binnacle/scripts/refs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One reference as it will be fetched; `tag`, when the manifest names one, must name the pinned commit.
 * @typedef {{ name: string, url: string, commit: string, local: boolean, tag?: string }} Ref
 */

/**
 * Resolve the manifests into the references to fetch.
 * @param {Record<string, { url?: string, commit?: string, tag?: string }>} manifest - `references.json`.
 * @param {Record<string, { url?: string, commit?: string }> | undefined} local - `references.local.json`, when there is one.
 * @param {string[]} [names] - the references to plan; every one when omitted.
 * @returns {Ref[]} the public references in manifest order, then this machine's own.
 * @throws when a reference lacks a url or a commit, or a name is not a reference.
 */
export function plan(manifest, local, names) {
  const refs = []
  for (const [name, ref] of Object.entries(manifest)) {
    if (!ref.url || !ref.commit) throw new Error(`${name}: needs a url and a commit`)
    refs.push({ name, url: local?.[name]?.url ?? ref.url, commit: ref.commit, local: false, ...ref.tag ? { tag: ref.tag } : {} })
  }
  for (const [name, ref] of Object.entries(local ?? {})) {
    if (name in manifest) continue
    if (!ref.url || !ref.commit) throw new Error(`${name}: needs a url and a commit`)
    refs.push({ name, url: ref.url, commit: ref.commit, local: true })
  }
  if (names === undefined || names.length === 0) return refs
  for (const name of names) {
    if (!refs.some(ref => ref.name === name)) throw new Error(`${name}: not a reference`)
  }
  return refs.filter(ref => names.includes(ref.name))
}

/**
 * Read both manifests at a repository root and plan every reference.
 * @param {string} root - the repository root.
 * @returns {Ref[]} every reference, as {@link plan} resolves them.
 */
export function references(root) {
  const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
  const local = existsSync(join(root, 'references.local.json')) ? read('references.local.json') : undefined
  return plan(read('references.json'), local)
}

/**
 * The commit a fetched reference stands at.
 * @param {string} dir - the reference's directory under `.refs`.
 * @returns {string | undefined} the full commit, or undefined when nothing is fetched there.
 */
export function fetchedAt(dir) {
  if (!existsSync(join(dir, '.git'))) return undefined
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // A directory initialized and never fetched has no HEAD yet.
    return undefined
  }
}

/**
 * The commit a tag names, read from `git ls-remote` for the tag and its peel.
 * @param {string} listing - the output of `git ls-remote <url> refs/tags/<tag> refs/tags/<tag>^{}`.
 * @returns {string | undefined} the commit an annotated tag peels to, or a lightweight tag names; undefined when nothing is listed.
 */
export function taggedCommit(listing) {
  const lines = listing.trim().split('\n').filter(Boolean)
  return (lines.find(line => line.endsWith('^{}')) ?? lines[0])?.split('\t')[0]
}

/**
 * What is wrong when a reference's tag does not name its pinned commit.
 * @param {Ref} ref - the reference, with its tag.
 * @param {string | undefined} tagged - the commit its source says the tag names; undefined when the source has no such tag.
 * @returns {string | undefined} the error to throw; undefined when the tag names the pin.
 */
export function tagMismatch(ref, tagged) {
  if (tagged?.startsWith(ref.commit)) return undefined
  if (tagged === undefined) return `${ref.name}: ${ref.url} has no tag ${ref.tag}; fetch its tags there, or check the pin in references.json`
  return `${ref.name}: tag ${ref.tag} names ${tagged ?? 'nothing'}, pinned ${ref.commit}`
}

/**
 * Fetch one reference at its pin, shallow and detached.
 * @param {Ref} ref - the reference.
 * @param {string} root - the repository root.
 * @returns {string} one line saying what was done.
 */
function fetchRef(ref, root) {
  const dir = join(root, '.refs', ref.name)
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (fetchedAt(dir)?.startsWith(ref.commit)) return `${ref.name}: at ${ref.commit.slice(0, 10)}`
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true })
    git('init', '-q')
    git('remote', 'add', 'origin', ref.url)
  } else {
    git('remote', 'set-url', 'origin', ref.url)
  }
  if (ref.tag !== undefined) {
    const tagged = taggedCommit(execFileSync('git', ['-C', dir, 'ls-remote', 'origin', `refs/tags/${ref.tag}`, `refs/tags/${ref.tag}^{}`], { encoding: 'utf8' }))
    const mismatch = tagMismatch(ref, tagged)
    if (mismatch !== undefined) throw new Error(mismatch)
  }
  git('fetch', '-q', '--depth', '1', 'origin', ref.commit)
  git('checkout', '-q', '--detach', 'FETCH_HEAD')
  const at = fetchedAt(dir)
  if (!at?.startsWith(ref.commit)) throw new Error(`${ref.name}: fetched ${at}, pinned ${ref.commit}`)
  return `${ref.name}: fetched ${ref.commit.slice(0, 10)}`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const names = process.argv.slice(2)
  const all = references(root)
  const wanted = names.length === 0 ? all : all.filter(ref => names.includes(ref.name))
  for (const name of names) if (!all.some(ref => ref.name === name)) throw new Error(`${name}: not a reference`)
  for (const ref of wanted) console.log(fetchRef(ref, root))
}
