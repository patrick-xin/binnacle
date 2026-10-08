import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tryRef } from './try.mjs'

function world(t) {
  const home = mkdtempSync(join(tmpdir(), 'try-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const calls = []
  const exec = (file, args) => {
    calls.push([file, ...args].join(' '))
    if (args.includes('worktree')) mkdirSync(args.at(-2), { recursive: true })
    if (file === 'pnpm' && args.length === 3) mkdirSync(join(args[1], 'node_modules', 'binnacle'), { recursive: true })
    return args.includes('rev-parse') ? 'abc1234\n' : ''
  }
  return { home, calls, deps: { root: '/repo', home, exec } }
}

test('`pnpm try <ref>` builds the ref in its own worktree, and a binnacle-try profile links it', (t) => {
  const { home, calls, deps } = world(t)
  const checkout = join(home, '.binnacle', 'try')
  const profile = join(home, '.dsh', 'profiles', 'binnacle-try')

  assert.equal(tryRef('task/163', deps), 'task/163 at abc1234: run it with `dsh --profile binnacle-try`')
  assert.deepEqual(calls, [
    'git -C /repo fetch -q origin',
    `git -C /repo worktree add -q --detach ${checkout} task/163`,
    `pnpm -C ${checkout} install --frozen-lockfile`,
    `pnpm -C ${checkout} build`,
    `pnpm -C ${profile} install`,
    `git -C ${checkout} rev-parse --short HEAD`,
  ])
  const linked = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  assert.equal(linked.dependencies.binnacle, `link:${join(checkout, 'packages', 'binnacle')}`)
  assert.deepEqual(linked.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'binnacle'])
})

test("A second try moves the same worktree, and the profile takes the person's own patch", (t) => {
  const { home, calls, deps } = world(t)
  const personal = join(home, '.dsh', 'profiles', 'binnacle')
  mkdirSync(personal, { recursive: true })
  writeFileSync(join(personal, 'cordis.patch.yml'), '- id: binnacle-approvals\n  disabled: true\n')
  tryRef('task/163', deps)
  calls.length = 0

  tryRef('task/165', deps)

  const checkout = join(home, '.binnacle', 'try')
  assert.equal(calls[1], `git -C ${checkout} switch -q --detach task/165`)
  assert.equal(calls.filter((call) => call.endsWith('binnacle-try install')).length, 0)
  assert.equal(
    readFileSync(join(home, '.dsh', 'profiles', 'binnacle-try', 'cordis.patch.yml'), 'utf8'),
    '- id: binnacle-approvals\n  disabled: true\n',
  )
})
