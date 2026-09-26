#!/usr/bin/env node
/**
 * Boot the bundle under the real launcher, at the pin, drawing nothing.
 *
 * Runs `dsh --profile binnacle --check` and requires the launcher on `PATH`
 * to be the release the `dsh` reference is pinned at, since the bundle
 * compiles against that release and runs inside whatever launcher mounts it.
 * Needs the profile `pnpm dsh:profile` writes and a fresh `pnpm build`.
 * @module binnacle/scripts/check-boot
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitTag } from './upstream.mjs'

/** How long a boot may take, in milliseconds. */
const LIMIT = 120_000

/**
 * Read one boot.
 * @param {string} pinned - the tag the `dsh` reference is pinned at.
 * @param {{ launcher: string | undefined, status: number | null, stdout: string, timedOut?: boolean }} boot - `dsh --version`, undefined when there is no launcher; the check's exit status and stdout; and whether it was stopped for running past the limit.
 * @returns {string[]} one line per way the boot fell short.
 */
export function readBoot(pinned, boot) {
  const version = splitTag(pinned)?.version
  if (boot.launcher === undefined) return [`dsh is not on PATH; install @deepseek-ai/dsh@${version}`]
  const problems = []
  if (boot.launcher !== version) problems.push(`dsh ${boot.launcher} is on PATH, but the dsh reference is ${pinned}; install @deepseek-ai/dsh@${version}`)
  if (boot.timedOut === true) {
    problems.push(`dsh --profile binnacle --check did not finish in ${LIMIT / 1000} s; a row waiting on a service nothing provides keeps it alive — its stderr names the row`)
  } else if (boot.status !== 0 || !boot.stdout.includes('binnacle: ok')) {
    problems.push(`dsh --profile binnacle --check exited ${boot.status} without reporting \`binnacle: ok\`; run it to see why`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const pinned = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8')).dsh.tag
  const version = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
  const launcher = version.status === 0 ? version.stdout.trim() : undefined
  const run = launcher === undefined
    ? { status: null, stdout: '', error: undefined }
    : spawnSync('dsh', ['--profile', 'binnacle', '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: LIMIT })
  const timedOut = /** @type {NodeJS.ErrnoException | undefined} */ (run.error)?.code === 'ETIMEDOUT'
  const problems = readBoot(pinned, { launcher, status: run.status, stdout: run.stdout, timedOut })
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-boot: ok (dsh ${launcher})` : `check-boot: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
