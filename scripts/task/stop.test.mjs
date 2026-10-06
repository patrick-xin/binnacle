import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, git, logLines, makeWorld } from './world.mjs'
import { run } from './task.mjs'

async function merged(world, n) {
  await built(world, n, '--by', 'lead')
  const worktree = join(world.home, 'worktrees', String(n))
  appendFileSync(join(worktree, 'README.md'), 'more\n')
  git(worktree, ['add', 'README.md'])
  git(worktree, ['commit', '-m', 'work'])
  git(worktree, ['push', 'origin', `task/${n}:main`])
}

function reviewOf(world, n) {
  return join(world.home, 'worktrees', `${n}-review`)
}

test('`task stop <n>` removes the worktrees and the branch, sets `stopped`, and keeps the task folder as the record', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140)
  const review = reviewOf(world, 140)
  const worktree = join(world.home, 'worktrees', '140')

  const stopped = await run(['stop', '140'], world.deps)

  assert.equal(stopped.code, 0)
  assert.equal(stopped.stdout, 'task 140: stopped round 0\n')
  assert.equal(existsSync(worktree), false)
  assert.equal(existsSync(review), false)
  assert.equal(git(world.repo, ['worktree', 'list']).includes('140'), false)
  assert.equal(git(world.repo, ['branch', '--list', 'task/140']), '')
  assert.deepEqual(logLines(world, 140).at(-1), { at: '2026-10-05T10:03:00.000Z', role: 'lead', from: 'approved', to: 'stopped', round: 0 })
  assert.equal(existsSync(join(world.home, 'tasks', '140', 'task.json')), true)

  // A second stop of a stopped task changes nothing and exits 0.
  const again = await run(['stop', '140'], world.deps)
  assert.equal(again.code, 0)
  assert.equal(logLines(world, 140).length, 2)
})

test('`task stop` refuses a worktree with changes that are not committed, and a branch that is not merged into `origin/main`, unless it gets `--force`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140)
  const worktree = join(world.home, 'worktrees', '140')
  appendFileSync(join(worktree, 'README.md'), 'not committed\n')

  const dirty = await run(['stop', '140'], world.deps)
  assert.equal(dirty.code, 1)
  assert.match(dirty.stderr, /cannot remove the worktree .*140.*--force/)
  assert.equal(logLines(world, 140).at(-1).to, 'approved')
  assert.equal(existsSync(worktree), true)
  assert.match(git(world.repo, ['branch', '--list', 'task/140']), /task\/140$/)

  const forced = await run(['stop', '140', '--force'], world.deps)
  assert.equal(forced.code, 0)
  assert.equal(logLines(world, 140).at(-1).to, 'stopped')

  // A clean worktree goes, but a branch that is not merged into origin/main stays.
  await merged(world, 141)
  const clean = join(world.home, 'worktrees', '141')
  git(clean, ['commit', '--allow-empty', '-m', 'not merged'])
  const unmerged = await run(['stop', '141'], world.deps)
  assert.equal(unmerged.code, 1)
  assert.match(unmerged.stderr, /the branch task\/141 is not merged into origin\/main/)
  assert.equal(logLines(world, 141).at(-1).to, 'approved')
  assert.equal(existsSync(clean), false)
  assert.match(git(world.repo, ['branch', '--list', 'task/141']), /task\/141$/)

  const forcedUnmerged = await run(['stop', '141', '--force'], world.deps)
  assert.equal(forcedUnmerged.code, 0)
  assert.equal(logLines(world, 141).at(-1).to, 'stopped')
  assert.equal(git(world.repo, ['branch', '--list', 'task/141']), '')
})

test("`task stop` is the Lead's command: another role that passes `--as` is refused, and the state does not change", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140)
  const worktree = join(world.home, 'worktrees', '140')

  for (const role of ['implementer', 'reviewer']) {
    const refused = await run(['stop', '140', '--as', role], world.deps)
    assert.equal(refused.code, 1)
    assert.match(refused.stderr, new RegExp(`the ${role} cannot stop a task; the lead stops it`))
    assert.equal(logLines(world, 140).at(-1).to, 'approved')
    assert.equal(existsSync(worktree), true)
  }

  const byLead = await run(['stop', '140', '--as', 'lead'], world.deps)
  assert.equal(byLead.code, 0)
  assert.equal(logLines(world, 140).at(-1).to, 'stopped')
})

test("`task stop <spec>` removes the Spec's review checkout, and sets `stopped`", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(139)
  assert.equal((await run(['start', '139'], world.deps)).code, 0)
  const stopped = await run(['stop', '139'], world.deps)
  assert.equal(stopped.code, 0, stopped.stderr)
  assert.equal(existsSync(reviewOf(world, 139)), false)
  assert.equal(logLines(world, 139).at(-1).to, 'stopped')
})

test('A `task stop` that failed part of the way can run again, and it finishes the stop', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140)
  const review = reviewOf(world, 140)
  appendFileSync(join(review, 'README.md'), 'the Reviewer left a note\n')

  const failed = await run(['stop', '140'], world.deps)
  assert.equal(failed.code, 1)
  assert.match(failed.stderr, /cannot remove the worktree .*140-review/)
  assert.equal(logLines(world, 140).at(-1).to, 'approved')
  assert.equal(existsSync(join(world.home, 'worktrees', '140')), false)
  assert.equal(existsSync(review), true)

  // The Reviewer's checkout is clean again, so the second run finishes the stop.
  git(review, ['restore', 'README.md'])
  const finished = await run(['stop', '140'], world.deps)
  assert.equal(finished.code, 0)
  assert.equal(logLines(world, 140).at(-1).to, 'stopped')
  assert.equal(existsSync(review), false)
  assert.equal(git(world.repo, ['worktree', 'list']).includes('140'), false)
})
