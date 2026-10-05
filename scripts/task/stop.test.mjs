import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeWorld } from './world.mjs'
import { run } from './task.mjs'

/** The lines of a task's log. */
function lines(world, n) {
  return readFileSync(join(world.home, 'tasks', String(n), 'log.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

/** Start a task, commit in its worktree, and merge the branch into `origin/main`. */
async function merged(world, n, path) {
  world.setIssue(n, world.shape(path))
  assert.equal((await run(['start', String(n)], world.deps)).code, 0)
  const worktree = join(world.home, 'worktrees', String(n))
  appendFileSync(join(worktree, 'README.md'), 'more\n')
  git(worktree, ['add', 'README.md'])
  git(worktree, ['commit', '-m', 'work'])
  git(worktree, ['push', 'origin', `task/${n}:main`])
}

/** Make the Reviewer's checkout, detached at the tip. */
function reviewOf(world, n) {
  const review = join(world.home, 'worktrees', `${n}-review`)
  git(world.repo, ['worktree', 'add', '--detach', review, 'HEAD'])
  return review
}

test('`task stop <n>` removes the worktrees and the branch, sets `stopped`, and keeps the task folder as the record', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140, 'scripts/task/')
  const review = reviewOf(world, 140)
  const worktree = join(world.home, 'worktrees', '140')

  const stopped = await run(['stop', '140'], world.deps)

  assert.equal(stopped.code, 0)
  assert.equal(stopped.stdout, 'task 140: stopped round 0\n')
  assert.equal(existsSync(worktree), false)
  assert.equal(existsSync(review), false)
  assert.equal(git(world.repo, ['worktree', 'list']).includes('140'), false)
  assert.equal(git(world.repo, ['branch', '--list', 'task/140']), '')
  assert.deepEqual(lines(world, 140).at(-1), { at: '2026-10-05T10:00:00.000Z', role: 'lead', from: 'spec', to: 'stopped', round: 0 })
  assert.equal(existsSync(join(world.home, 'tasks', '140', 'task.json')), true)

  // A second stop of a stopped task changes nothing and exits 0.
  const again = await run(['stop', '140'], world.deps)
  assert.equal(again.code, 0)
  assert.equal(lines(world, 140).length, 2)
})

test('`task stop` refuses a worktree with changes that are not committed, and a branch that is not merged into `origin/main`, unless it gets `--force`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140, 'scripts/task/')
  const worktree = join(world.home, 'worktrees', '140')
  appendFileSync(join(worktree, 'README.md'), 'not committed\n')

  const dirty = await run(['stop', '140'], world.deps)
  assert.equal(dirty.code, 1)
  assert.match(dirty.stderr, /cannot remove the worktree .*140.*--force/)
  assert.equal(lines(world, 140).at(-1).to, 'spec')
  assert.equal(existsSync(worktree), true)
  assert.match(git(world.repo, ['branch', '--list', 'task/140']), /task\/140$/)

  const forced = await run(['stop', '140', '--force'], world.deps)
  assert.equal(forced.code, 0)
  assert.equal(lines(world, 140).at(-1).to, 'stopped')

  // A clean worktree goes, but a branch that is not merged into origin/main stays.
  await merged(world, 141, 'docs/')
  const clean = join(world.home, 'worktrees', '141')
  git(clean, ['commit', '--allow-empty', '-m', 'not merged'])
  const unmerged = await run(['stop', '141'], world.deps)
  assert.equal(unmerged.code, 1)
  assert.match(unmerged.stderr, /the branch task\/141 is not merged into origin\/main/)
  assert.equal(lines(world, 141).at(-1).to, 'spec')
  assert.equal(existsSync(clean), false)
  assert.match(git(world.repo, ['branch', '--list', 'task/141']), /task\/141$/)

  const forcedUnmerged = await run(['stop', '141', '--force'], world.deps)
  assert.equal(forcedUnmerged.code, 0)
  assert.equal(lines(world, 141).at(-1).to, 'stopped')
  assert.equal(git(world.repo, ['branch', '--list', 'task/141']), '')
})

test("`task stop` is the Lead's command: another role that passes `--as` is refused, and the state does not change", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140, 'scripts/task/')
  const worktree = join(world.home, 'worktrees', '140')

  for (const role of ['implementer', 'reviewer']) {
    const refused = await run(['stop', '140', '--as', role], world.deps)
    assert.equal(refused.code, 1)
    assert.match(refused.stderr, new RegExp(`the ${role} cannot stop a task; the lead stops it`))
    assert.equal(lines(world, 140).at(-1).to, 'spec')
    assert.equal(existsSync(worktree), true)
  }

  const byLead = await run(['stop', '140', '--as', 'lead'], world.deps)
  assert.equal(byLead.code, 0)
  assert.equal(lines(world, 140).at(-1).to, 'stopped')
})

test('a task holds its files until it is stopped, and no longer after', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140, 'docs/')

  const stillRunning = await run(['start', '141'], { ...world.deps, readIssue: () => Promise.resolve(world.shape('docs/')) })
  assert.equal(stillRunning.code, 1)
  assert.match(stillRunning.stderr, /docs\/ overlaps docs\/ of running task 140/)

  assert.equal((await run(['stop', '140'], world.deps)).code, 0)
  const after = await run(['start', '141'], { ...world.deps, readIssue: () => Promise.resolve(world.shape('docs/')) })
  assert.equal(after.code, 0)
})

test('A `task stop` that failed part of the way can run again, and it finishes the stop', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await merged(world, 140, 'scripts/task/')
  const review = reviewOf(world, 140)
  appendFileSync(join(review, 'README.md'), 'the Reviewer left a note\n')

  const failed = await run(['stop', '140'], world.deps)
  assert.equal(failed.code, 1)
  assert.match(failed.stderr, /cannot remove the worktree .*140-review/)
  assert.equal(lines(world, 140).at(-1).to, 'spec')
  assert.equal(existsSync(join(world.home, 'worktrees', '140')), false)
  assert.equal(existsSync(review), true)

  // The Reviewer's checkout is clean again, so the second run finishes the stop.
  git(review, ['restore', 'README.md'])
  const finished = await run(['stop', '140'], world.deps)
  assert.equal(finished.code, 0)
  assert.equal(lines(world, 140).at(-1).to, 'stopped')
  assert.equal(existsSync(review), false)
  assert.equal(git(world.repo, ['worktree', 'list']).includes('140'), false)
})
