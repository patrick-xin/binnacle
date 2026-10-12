#!/usr/bin/env node
// The try runs in its own worktree and profile, so the person's `binnacle` profile keeps running the main checkout.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROFILE = 'binnacle-try'

// The try reports its agent to herdr, so a driver waits on the pane's state, not on what the screen shows.
const HERDR_REPORT = join(dirname(fileURLToPath(import.meta.url)), 'herdr-report.mjs')
const HERDR_ROW = "- insert:\n    - id: herdr-report\n      name: './plugins/herdr-report.mjs'\n"

export function profileOf(checkout) {
  return {
    name: `dsh-profile-${PROFILE}`,
    version: '0.0.0',
    private: true,
    dependencies: { binnacle: `link:${join(checkout, 'packages', 'binnacle')}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'binnacle'] } },
  }
}

export function tryRef(ref, { root, home, exec }) {
  const checkout = join(home, '.binnacle', 'try')
  const profile = join(home, '.dsh', 'profiles', PROFILE)
  exec('git', ['-C', root, 'fetch', '-q', 'origin'])
  if (existsSync(checkout)) exec('git', ['-C', checkout, 'switch', '-q', '--detach', ref])
  else exec('git', ['-C', root, 'worktree', 'add', '-q', '--detach', checkout, ref])
  exec('pnpm', ['-C', checkout, 'install', '--frozen-lockfile'])
  exec('pnpm', ['-C', checkout, 'build'])

  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), `${JSON.stringify(profileOf(checkout), null, 2)}\n`)
  writeFileSync(join(profile, 'cordis.yml'), '[]\n')
  const patch = join(home, '.dsh', 'profiles', 'binnacle', 'cordis.patch.yml')
  const own = existsSync(patch) ? readFileSync(patch, 'utf8') : ''
  writeFileSync(join(profile, 'cordis.patch.yml'), `${own}${own === '' || own.endsWith('\n') ? '' : '\n'}${HERDR_ROW}`)
  mkdirSync(join(profile, 'plugins'), { recursive: true })
  copyFileSync(HERDR_REPORT, join(profile, 'plugins', 'herdr-report.mjs'))
  if (!existsSync(join(profile, 'node_modules', 'binnacle'))) exec('pnpm', ['-C', profile, 'install'])

  const at = exec('git', ['-C', checkout, 'rev-parse', '--short', 'HEAD']).trim()
  return `${ref} at ${at}: run it with \`dsh --profile ${PROFILE}\``
}

const exec = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = process.argv[2]
  if (ref === undefined) {
    process.stderr.write('usage: pnpm try <ref>, such as task/163 or a commit\n')
    process.exit(2)
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    process.stdout.write(`${tryRef(ref, { root, home: homedir(), exec })}\n`)
  } catch (error) {
    process.stderr.write(`try: ${error.message}\n`)
    process.exit(1)
  }
}
