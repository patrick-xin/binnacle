#!/usr/bin/env node
/**
 * Boot the bundle under the real launcher, at the pin, drawing nothing.
 *
 * Runs `dsh --profile binnacle --check` and requires the launcher on `PATH`
 * to be the release the `dsh` reference is pinned at, since the bundle
 * compiles against that release and runs inside whatever launcher mounts it.
 * The check reports the roster of presets the registry mounted, which this
 * holds to the five binnacle ships, and its stderr names any row left
 * pending, which this refuses. Needs the profile `pnpm dsh:profile`
 * writes and a fresh `pnpm build`.
 * @module binnacle/scripts/check-boot
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitTag } from './upstream.mjs'

/** How long a boot may take, in milliseconds. */
const LIMIT = 120_000

/** The presets the boot's roster must hold: dsh's four web presets, copied, and binnacle's own author. */
const ROSTER = ['author', 'cordis', 'minimal', 'ptc', 'standard']

/**
 * Read one boot.
 * @param {string} pinned - the tag the `dsh` reference is pinned at.
 * @param {{ launcher: string | undefined, status: number | null, stdout: string, stderr?: string, timedOut?: boolean }} boot - `dsh --version`, undefined when there is no launcher; the check's exit status, stdout and stderr; and whether it was stopped for running past the limit.
 * @returns {string[]} one line per way the boot fell short.
 */
export function readBoot(pinned, boot) {
  const version = splitTag(pinned)?.version
  if (boot.launcher === undefined) return [`dsh is not on PATH; install @deepseek-ai/dsh@${version}`]
  const problems = []
  if (boot.launcher !== version)
    problems.push(`dsh ${boot.launcher} is on PATH, but the dsh reference is ${pinned}; install @deepseek-ai/dsh@${version}`)
  for (const line of (boot.stderr ?? '').split('\n')) {
    // dsh words one missing dependency 'service' and several 'services' (`dsh:packages/boot/app-boot/src/index.ts`); the shared prefix reads both.
    if (line.includes(': pending (waiting for service'))
      problems.push(
        `a row the boot left pending: ${line.trim()} — a row waits on a service nothing provides; add the row that publishes it, or name its provider`,
      )
  }
  if (boot.timedOut === true) {
    problems.push(
      `dsh --profile binnacle --check did not finish in ${LIMIT / 1000} s; a row waiting on a service nothing provides keeps it alive — its stderr names the row`,
    )
  } else if (boot.status !== 0 || !boot.stdout.includes('binnacle: ok')) {
    problems.push(`dsh --profile binnacle --check exited ${boot.status} without reporting \`binnacle: ok\`; run it to see why`)
  } else {
    const listed =
      /presets: ([^)\n]*)/
        .exec(boot.stdout)?.[1]
        ?.split(',')
        .map((id) => id.trim()) ?? []
    const missing = ROSTER.filter((id) => !listed.includes(id))
    if (missing.length > 0)
      problems.push(
        `the roster the boot reports holds no ${missing.join(', ')}; run \`dsh --profile binnacle --check\` to see what the registry mounted`,
      )
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const pinned = JSON.parse(readFileSync(join(root, 'references.json'), 'utf8')).dsh.tag
  const version = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
  const launcher = version.status === 0 ? version.stdout.trim() : undefined
  const run =
    launcher === undefined
      ? { status: null, stdout: '', stderr: '', error: undefined }
      : spawnSync('dsh', ['--profile', 'binnacle', '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: LIMIT })
  const timedOut = /** @type {NodeJS.ErrnoException | undefined} */ (run.error)?.code === 'ETIMEDOUT'
  const problems = readBoot(pinned, { launcher, status: run.status, stdout: run.stdout, stderr: run.stderr, timedOut })
  for (const problem of problems) console.error(problem)
  console.log(problems.length === 0 ? `check-boot: ok (dsh ${launcher})` : `check-boot: ${problems.length} problems`)
  process.exitCode = problems.length === 0 ? 0 : 1
}
