import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, logLines, makeWorld, steps } from './world.mjs'
import { run } from './task.mjs'

test("`task start <spec>` makes the Reviewer's checkout `~/.binnacle/worktrees/<spec>-review` at `origin/main`, and a Spec's folder with the state `spec` at round 0. A Spec has no branch", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)

  const result = await run(['start', '139'], world.deps)

  assert.equal(result.code, 0, result.stderr)
  const review = join(world.home, 'worktrees', '139-review')
  assert.equal(git(review, ['rev-parse', 'HEAD']), git(world.repo, ['rev-parse', 'origin/main']))
  assert.equal(existsSync(join(world.home, 'worktrees', '139')), false)
  assert.equal(git(world.repo, ['branch', '--list', 'task/139']), '')
  assert.deepEqual(JSON.parse(readFileSync(join(world.home, 'tasks', '139', 'task.json'), 'utf8')), {
    n: 139,
    kind: 'spec',
    createdAt: '2026-10-05T10:00:00.000Z',
  })
  assert.deepEqual(logLines(world, 139), [{ at: '2026-10-05T10:00:00.000Z', role: 'lead', from: null, to: 'spec', round: 0 }])
})

test("A Spec's approval at round 0 ends it: no state follows", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)
  await steps(world, ['start', '139'], ['set', '139', 'approved', '--as', 'reviewer'])
  const building = await run(['set', '139', 'building', '--as', 'implementer'], world.deps)
  assert.equal(building.code, 1)
  assert.match(building.stderr, /task 139: building cannot follow approved; nothing can follow it/)
})

test('`task start` refuses a number whose task folder or review checkout exists, and changes nothing', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)
  world.spec(141)
  assert.equal((await run(['start', '139'], world.deps)).code, 0)
  const before = readFileSync(join(world.home, 'tasks', '139', 'log.ndjson'), 'utf8')

  const again = await run(['start', '139'], world.deps)
  assert.equal(again.code, 1)
  assert.match(again.stderr, /task 139: the task folder .*exists already/)
  assert.equal(readFileSync(join(world.home, 'tasks', '139', 'log.ndjson'), 'utf8'), before)

  mkdirSync(join(world.home, 'worktrees', '141-review'))
  const atReview = await run(['start', '141'], world.deps)
  assert.equal(atReview.code, 1)
  assert.match(atReview.stderr, /task 141: the worktree .*141-review exists already/)
  assert.equal(existsSync(join(world.home, 'tasks', '141')), false)
})

test('`task build <ticket>` refuses an issue with no parent, a Spec that was not started, and a Spec whose round 0 is not approved', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, '## Door\n\nTwo-way.\n')
  const orphan = await run(['build', '140'], world.deps)
  assert.equal(orphan.code, 1)
  assert.match(orphan.stderr, /issue 140 has no parent; a Ticket is a sub-issue of its Spec/)

  world.spec(139)
  world.ticket(140, 139)
  const unstarted = await run(['build', '140'], world.deps)
  assert.equal(unstarted.code, 1)
  assert.match(unstarted.stderr, /the Spec 139 of 140 has no task folder; run task start 139 first/)

  await steps(world, ['start', '139'])
  const early = await run(['build', '140'], world.deps)
  assert.equal(early.code, 1)
  assert.match(early.stderr, /the Spec 139 is spec at round 0; task build follows its approved at round 0/)
  assert.equal(existsSync(join(world.home, 'tasks', '140')), false)
  assert.equal(existsSync(join(world.home, 'worktrees', '140')), false)
})

test("`task build <ticket>` makes the worktree on a new branch `task/<n>` from `origin/main`, the Reviewer's checkout, and a Ticket's folder that begins at its Spec's approval", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)
  world.ticket(140, 139)
  await steps(world, ['start', '139'], ['set', '139', 'approved', '--as', 'reviewer'])

  const result = await run(['build', '140'], world.deps)

  assert.equal(result.code, 0, result.stderr)
  const base = git(world.repo, ['rev-parse', 'origin/main'])
  assert.equal(result.stdout, `task 140: a Ticket of 139, built from ${base.slice(0, 7)}\n`)
  const worktree = join(world.home, 'worktrees', '140')
  assert.equal(git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']), 'task/140')
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), base)
  assert.equal(git(join(world.home, 'worktrees', '140-review'), ['rev-parse', 'HEAD']), base)
  assert.deepEqual(JSON.parse(readFileSync(join(world.home, 'tasks', '140', 'task.json'), 'utf8')), {
    n: 140,
    kind: 'ticket',
    spec: 139,
    branch: 'task/140',
    worktree,
    createdAt: '2026-10-05T10:02:00.000Z',
  })
  assert.deepEqual(logLines(world, 140), [{ at: '2026-10-05T10:02:00.000Z', role: 'lead', from: null, to: 'approved', round: 0 }])
})

test('`task build` refuses a Ticket whose task folder, worktree or branch exists, and changes nothing', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)
  for (const n of [140, 141, 142]) world.ticket(n, 139)
  await steps(world, ['start', '139'], ['set', '139', 'approved', '--as', 'reviewer'], ['build', '140'])

  const again = await run(['build', '140'], world.deps)
  assert.equal(again.code, 1)
  assert.match(again.stderr, /task 140: the task folder .*exists already/)

  mkdirSync(join(world.home, 'worktrees', '141'))
  const atWorktree = await run(['build', '141'], world.deps)
  assert.equal(atWorktree.code, 1)
  assert.match(atWorktree.stderr, /task 141: the worktree .*exists already/)
  assert.equal(existsSync(join(world.home, 'tasks', '141')), false)

  git(world.repo, ['branch', 'task/142'])
  const atBranch = await run(['build', '142'], world.deps)
  assert.equal(atBranch.code, 1)
  assert.match(atBranch.stderr, /task 142: the branch task\/142 exists already/)
  assert.equal(existsSync(join(world.home, 'tasks', '142')), false)
  assert.equal(existsSync(join(world.home, 'worktrees', '142')), false)
})
