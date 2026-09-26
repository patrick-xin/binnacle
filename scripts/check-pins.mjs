#!/usr/bin/env node
/**
 * Hold every package pin exact, and to the reference it is read against.
 *
 * Every dependency is pinned to one version, never a range. A dsh package is
 * pinned to the version the `dsh` reference's tag names, pi-tui to the one the
 * `pi` reference's tag names, and Cordis to the version dsh vendors at its
 * pin — so the source an agent reads is the source that runs, and moving one
 * without the other fails here.
 * @module binnacle/scripts/check-pins
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { references } from './refs.mjs'

/**
 * Check a set of dependency pins against the references.
 * @param {Record<string, string>} deps - every dependency and the version it is pinned to.
 * @param {Record<string, { tag?: string }>} refs - the references, by name, with the tag each is pinned at.
 * @param {string | undefined} cordis - the Cordis version dsh vendors at its pin; undefined when dsh is not fetched.
 * @returns {string[]} one line per pin that is a range or disagrees with its reference.
 */
export function checkPins(deps, refs, cordis) {
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
    else if (name === '@deepseek-ai/cordis' && cordis !== version) {
      problems.push(`${name} is ${version}, but dsh at its pin vendors ${cordis ?? 'nothing fetched; run `pnpm refs`'}`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = JSON.parse(readFileSync(join(root, 'packages', 'binnacle', 'package.json'), 'utf8'))
  const deps = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies }
  const refs = Object.fromEntries(references(root).map(ref => [ref.name, ref]))
  let cordis
  try {
    const vendored = execFileSync('git', ['-C', join(root, '.refs', 'dsh'), 'show', 'HEAD:vendor/cordis/package.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    cordis = JSON.parse(vendored).version
  } catch {
    // dsh not fetched: the Cordis pin is reported unverifiable below.
  }
  const problems = checkPins(deps, refs, cordis)
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-pins: ok (${Object.keys(deps).length} pins)` : `check-pins: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
