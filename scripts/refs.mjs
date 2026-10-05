#!/usr/bin/env node
// references.local.json may point a public reference at a local clone: it fetches faster, and never moves the pin.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function plan(manifest, local, names) {
  const refs = []
  for (const [name, ref] of Object.entries(manifest)) {
    if (!ref.url || !ref.commit) throw new Error(`${name}: needs a url and a commit`)
    refs.push({ name, url: local?.[name]?.url ?? ref.url, commit: ref.commit, local: false, ...(ref.tag ? { tag: ref.tag } : {}) })
  }
  for (const [name, ref] of Object.entries(local ?? {})) {
    if (name in manifest) continue
    if (!ref.url || !ref.commit) throw new Error(`${name}: needs a url and a commit`)
    refs.push({ name, url: ref.url, commit: ref.commit, local: true })
  }
  if (names === undefined || names.length === 0) return refs
  for (const name of names) {
    if (!refs.some((ref) => ref.name === name)) throw new Error(`${name}: not a reference`)
  }
  return refs.filter((ref) => names.includes(ref.name))
}

export function references(root) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'))
  const local = existsSync(join(root, 'references.local.json')) ? read('references.local.json') : undefined
  return plan(read('references.json'), local)
}

export function fetchedAt(dir) {
  if (!existsSync(join(dir, '.git'))) return undefined
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // A directory initialized and never fetched has no HEAD yet.
    return undefined
  }
}

export function taggedCommit(listing) {
  const lines = listing.trim().split('\n').filter(Boolean)
  return (lines.find((line) => line.endsWith('^{}')) ?? lines[0])?.split('\t')[0]
}

export function tagMismatch(ref, tagged) {
  if (tagged?.startsWith(ref.commit)) return undefined
  if (tagged === undefined)
    return `${ref.name}: ${ref.url} has no tag ${ref.tag}; fetch its tags there, or check the pin in references.json`
  return `${ref.name}: tag ${ref.tag} names ${tagged ?? 'nothing'}, pinned ${ref.commit}`
}

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
    const tagged = taggedCommit(
      execFileSync('git', ['-C', dir, 'ls-remote', 'origin', `refs/tags/${ref.tag}`, `refs/tags/${ref.tag}^{}`], { encoding: 'utf8' }),
    )
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
  const wanted = names.length === 0 ? all : all.filter((ref) => names.includes(ref.name))
  for (const name of names) if (!all.some((ref) => ref.name === name)) throw new Error(`${name}: not a reference`)
  for (const ref of wanted) console.log(fetchRef(ref, root))
}
