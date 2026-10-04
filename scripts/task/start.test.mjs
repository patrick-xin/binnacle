import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeWorld } from './world.mjs'
import { run } from './task.mjs'

test('`task start <n>` makes the worktree `~/.binnacle/worktrees/<n>` on a new branch `task/<n>` from `origin/main`, and the task folder with the state `spec` at round 0', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))

  const result = await run(['start', '140'], world.deps)

  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  const worktree = join(world.home, 'worktrees', '140')
  assert.ok(existsSync(join(worktree, 'README.md')), 'the worktree holds a checkout of main')
  assert.equal(git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']), 'task/140')
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), git(world.repo, ['rev-parse', 'origin/main']))
  const task = JSON.parse(readFileSync(join(world.home, 'tasks', '140', 'task.json'), 'utf8'))
  assert.deepEqual(task, {
    n: 140,
    branch: 'task/140',
    worktree,
    files: ['scripts/task/'],
    createdAt: '2026-10-05T10:00:00.000Z',
  })
  assert.equal(
    readFileSync(join(world.home, 'tasks', '140', 'log.ndjson'), 'utf8'),
    '{"at":"2026-10-05T10:00:00.000Z","role":"lead","from":null,"to":"spec","round":0}\n',
  )
})

test('`task start` refuses a task whose issue lists no files under `## Code shape`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(141, '## Intent\n\nNo shape at all.\n\n## Records\n\n- none.\n')
  world.setIssue(142, '## Code shape\n\nNone.\n')

  for (const n of [141, 142]) {
    const result = await run(['start', String(n)], world.deps)
    assert.equal(result.code, 1)
    assert.match(result.stderr, new RegExp(`issue ${n} lists no files under ## Code shape`))
    assert.equal(existsSync(join(world.home, 'tasks', String(n))), false)
    assert.equal(existsSync(join(world.home, 'worktrees', String(n))), false)
  }
})

test('`task start` refuses a path that is not relative to the repository, or not in its normal form', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(143, world.shape('./scripts/task/'))
  world.setIssue(144, world.shape('scripts//task/'))

  for (const [n, message] of [
    [143, '[.]/scripts/task/: not a path relative to the repository'],
    [144, 'scripts//task/: not in its normal form'],
  ]) {
    const result = await run(['start', String(n)], world.deps)
    assert.equal(result.code, 1)
    assert.match(result.stderr, new RegExp(message))
    assert.equal(existsSync(join(world.home, 'tasks', String(n))), false)
  }
})

test('`task start` refuses when the Implementer and the Reviewer in `.agents/roles.json` are of the same family', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  writeFileSync(join(world.repo, '.agents', 'roles.json'), JSON.stringify({ implementer: { family: 'zai' }, reviewer: { family: 'zai' } }))

  const result = await run(['start', '140'], world.deps)

  assert.equal(result.code, 1)
  assert.match(result.stderr, /the implementer and the reviewer are of the same family zai/)
  assert.equal(existsSync(join(world.home, 'tasks', '140')), false)
  assert.equal(existsSync(join(world.home, 'worktrees', '140')), false)
})

test('`task start` refuses a task whose files overlap the files of a running task, and names the task and the path', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)

  world.setIssue(141, world.shape('scripts/task/task.mjs'))
  world.setIssue(142, world.shape('scripts/'))
  for (const [n, path] of [
    [141, 'scripts/task/task.mjs'],
    [142, 'scripts/'],
  ]) {
    const result = await run(['start', String(n)], world.deps)
    assert.equal(result.code, 1)
    assert.match(result.stderr, new RegExp(`${path} overlaps.*task 140`))
    assert.equal(existsSync(join(world.home, 'tasks', String(n))), false)
  }

  world.setIssue(143, world.shape('docs/'))
  assert.equal((await run(['start', '143'], world.deps)).code, 0)
})

test('`task start` refuses a number whose task folder, worktree or branch exists, and changes nothing', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  world.setIssue(141, world.shape('docs/'))
  world.setIssue(142, world.shape('intents/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  const log = join(world.home, 'tasks', '140', 'log.ndjson')
  const before = readFileSync(log, 'utf8')

  const again = await run(['start', '140'], world.deps)
  assert.equal(again.code, 1)
  assert.match(again.stderr, /task 140: the task folder .*exists already/)
  assert.equal(readFileSync(log, 'utf8'), before)

  mkdirSync(join(world.home, 'worktrees', '141'))
  const atWorktree = await run(['start', '141'], world.deps)
  assert.equal(atWorktree.code, 1)
  assert.match(atWorktree.stderr, /task 141: the worktree .*exists already/)
  assert.equal(existsSync(join(world.home, 'tasks', '141')), false)

  git(world.repo, ['branch', 'task/142'])
  const atBranch = await run(['start', '142'], world.deps)
  assert.equal(atBranch.code, 1)
  assert.match(atBranch.stderr, /task 142: the branch task\/142 exists already/)
  assert.equal(existsSync(join(world.home, 'tasks', '142')), false)
  assert.equal(existsSync(join(world.home, 'worktrees', '142')), false)
})
