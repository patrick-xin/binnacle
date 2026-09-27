import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { profileFiles, writeProfile } from './profile.mjs'

/**
 * A real repository with a real linked worktree, in a temporary directory:
 * fake nothing git owns. The paths are canonical, so what git lists for the
 * main checkout is what the test expects to see named.
 * @returns {{ dir: string, main: string, fold: string }} the scratch directory, the main checkout cut within it, and the worktree cut from that.
 */
function repoWithFold() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'binnacle-profile-')))
  const main = join(dir, 'main')
  mkdirSync(main)
  const git = (...args) => execFileSync('git', ['-C', main, ...args])
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'sheep@example.com')
  git('config', 'user.name', 'sheep')
  writeFileSync(join(main, 'package.json'), '{}\n')
  git('add', 'package.json')
  git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'one commit, so a worktree can be cut')
  git('worktree', 'add', '-q', join(dir, 'fold'))
  return { dir, main, fold: join(dir, 'fold') }
}

test('the profile links the package and stacks it over dsh-base', () => {
  const files = profileFiles('/work/binnacle/packages/binnacle')
  assert.deepEqual(JSON.parse(files['package.json']), {
    name: 'dsh-profile-binnacle',
    version: '0.0.0',
    private: true,
    dependencies: { binnacle: 'link:/work/binnacle/packages/binnacle' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'binnacle'] } },
  })
  assert.match(files['cordis.yml'], /^\[\]$/m)
})

test('the person\'s own patch layer is offered, never owned', () => {
  const files = profileFiles('/work/binnacle/packages/binnacle')
  assert.match(files['cordis.patch.yml'], /^\[\]$/m)
  assert.deepEqual(Object.keys(files).toSorted(), ['cordis.patch.yml', 'cordis.yml', 'package.json'])
})

test('run from a linked worktree, the profile refuses, naming the main checkout, and writes nothing', () => {
  const { dir, main, fold } = repoWithFold()
  assert.throws(
    () => writeProfile(fold, join(dir, 'dsh-home', 'profiles', 'binnacle')),
    refusal => refusal.message.includes(main) && /run `pnpm dsh:profile` from the main checkout/.test(refusal.message),
    'the refusal names the main checkout and says what to change',
  )
  assert.equal(existsSync(join(dir, 'dsh-home')), false)
})

test('run from the main checkout, the profile is made as before', () => {
  const { dir, main } = repoWithFold()
  const profile = join(dir, 'dsh-home', 'profiles', 'binnacle')
  writeProfile(main, profile)
  assert.deepEqual(readdirSync(profile).toSorted(), ['cordis.patch.yml', 'cordis.yml', 'package.json'])
  assert.equal(JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dependencies.binnacle, `link:${join(main, 'packages', 'binnacle')}`)
})

test('a checkout git cannot speak for is made as the main one is', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'binnacle-profile-')))
  const profile = join(dir, 'profile')
  writeProfile(dir, profile)
  assert.equal(JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dependencies.binnacle, `link:${join(dir, 'packages', 'binnacle')}`)
})

test('the person\'s own patch layer is kept, never rewritten', () => {
  const { dir, main } = repoWithFold()
  const profile = join(dir, 'dsh-home', 'profiles', 'binnacle')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'cordis.patch.yml'), '# my model, my provider\n[]\n')
  writeProfile(main, profile)
  assert.equal(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'), '# my model, my provider\n[]\n')
  assert.equal(JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dependencies.binnacle, `link:${join(main, 'packages', 'binnacle')}`)
})
