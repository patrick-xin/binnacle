#!/usr/bin/env node
/**
 * Hold every package pin exact, and to the reference it is read against.
 *
 * Every dependency the root or the bundle declares is pinned to one version,
 * never a range. A dsh package is pinned to the version the `dsh` reference's
 * tag names, pi-tui to the one the `pi` reference's tag names, and any other
 * `@deepseek-ai` package — Cordis, its plugins, what they stand on — to the
 * version dsh vendors at its pin, so the source an agent reads is the source
 * that runs, and moving one without the other fails here.
 *
 * A declaration is what this bundle asks for; the lockfile is what pnpm
 * resolved. A package can arrive as a peer of a peer without ever being
 * declared, and then moves with nothing to compare it against, so every
 * `@deepseek-ai` package the tree materializes must be declared at the version
 * it resolves.
 * @module binnacle/scripts/check-pins
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { references } from './refs.mjs'

/**
 * Check a set of dependency pins against the references.
 * @param {Record<string, string>} deps - every dependency and the version it is pinned to.
 * @param {Record<string, { tag?: string }>} refs - the references, by name, with the tag each is pinned at.
 * @param {Record<string, string> | undefined} vendored - each package dsh vendors at its pin and its version; undefined when dsh is not fetched.
 * @returns {string[]} one line per pin that is a range or disagrees with its reference.
 */
export function checkPins(deps, refs, vendored) {
  const problems = []
  const against = (name, version, ref, prefix) => {
    const tag = refs[ref]?.tag
    if (tag === undefined) return problems.push(`${name}: the ${ref} reference names no tag in references.json`)
    if (tag !== `${prefix}${version}`) problems.push(`${name} is ${version}, but the ${ref} reference is ${tag}; move both together`)
  }
  for (const [name, version] of Object.entries(deps)) {
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
      problems.push(`${name} is ${version}; pin it exact`)
      continue
    }
    if (name.startsWith('@deepseek-ai/dsh-')) against(name, version, 'dsh', 'dsh-v')
    else if (name === '@earendil-works/pi-tui') against(name, version, 'pi', 'v')
    else if (name.startsWith('@deepseek-ai/')) {
      if (vendored === undefined) problems.push(`${name} is ${version}, but dsh is not fetched; run \`pnpm refs\``)
      else if (!(name in vendored)) problems.push(`${name} is not a dsh package, and dsh at its pin vendors no such package`)
      else if (vendored[name] !== version) problems.push(`${name} is ${version}, but dsh at its pin vendors ${vendored[name]}`)
    }
  }
  return problems
}

/**
 * Every `@deepseek-ai` package a pnpm lockfile resolves.
 * @param {string} lock - the text of `pnpm-lock.yaml`.
 * @returns {Record<string, string[]>} each package and the versions it resolves to, sorted.
 */
export function materialized(lock) {
  const section = lock.split(/^packages:$/m)[1]?.split(/^snapshots:$/m)[0] ?? ''
  const tree = {}
  for (const [, name, version] of section.matchAll(/^ {2}'(@deepseek-ai\/[^@']+)@([^'(]+)':$/gm)) {
    tree[name] = [...new Set([...tree[name] ?? [], version])].toSorted()
  }
  return tree
}

/**
 * Check what the tree materializes against what the manifest declares.
 * @param {Record<string, string[]>} tree - each `@deepseek-ai` package the lockfile resolves, as {@link materialized} reads it.
 * @param {Record<string, string>} deps - every dependency the manifest declares.
 * @returns {string[]} one line per package the tree holds undeclared, or off its declaration.
 */
export function checkTree(tree, deps) {
  const problems = []
  for (const [name, versions] of Object.entries(tree)) {
    const declared = deps[name]
    if (declared === undefined) {
      problems.push(`${name}@${versions.join(', ')} is in the tree but not declared; declare it in devDependencies at ${versions.join(', ')}`)
    } else if (versions.length !== 1 || versions[0] !== declared) {
      problems.push(`${name} is declared ${declared}, but the tree resolves ${versions.join(', ')}`)
    }
  }
  return problems
}

/**
 * Each package dsh vendors, read from a fetched dsh.
 * @param {string} dsh - the dsh reference's directory.
 * @returns {Record<string, string> | undefined} each vendored package and its version; undefined when dsh is not fetched.
 */
export function vendoredBy(dsh) {
  const vendor = join(dsh, 'vendor')
  if (!existsSync(vendor)) return undefined
  const found = {}
  for (const entry of readdirSync(vendor, { withFileTypes: true })) {
    const manifest = join(vendor, entry.name, 'package.json')
    if (!entry.isDirectory() || !existsSync(manifest)) continue
    const { name, version } = JSON.parse(readFileSync(manifest, 'utf8'))
    found[name] = version
  }
  return found
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const read = (...path) => JSON.parse(readFileSync(join(root, ...path, 'package.json'), 'utf8'))
  const deps = {}
  for (const manifest of [read(), read('packages', 'binnacle')]) {
    Object.assign(deps, manifest.dependencies, manifest.peerDependencies, manifest.devDependencies)
  }
  const refs = Object.fromEntries(references(root).map(ref => [ref.name, ref]))
  const problems = [
    ...checkPins(deps, refs, vendoredBy(join(root, '.refs', 'dsh'))),
    ...checkTree(materialized(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')), deps),
  ]
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-pins: ok (${Object.keys(deps).length} pins)` : `check-pins: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
