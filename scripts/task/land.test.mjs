import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeWorld } from './world.mjs'
import { run } from './task.mjs'

const MESSAGE = 'feat: the thing works\n\nWhat changed, and why.\n\nAuthor API: none.\n\nCloses #140\n'

/** Run each command, one minute apart, and check that each exits 0. */
async function steps(world, ...argvs) {
  for (const argv of argvs) {
    world.tick()
    const result = await run(argv, world.deps)
    assert.equal(result.code, 0, `${argv.join(' ')}: ${result.stderr}`)
  }
}

/** A task that the Lead built in two commits, approved at round 1, with its message and its proofs. */
async function approved(world, door = 'Two-way. Only the task tool changes.') {
  world.setIssue(140, `${world.shape('scripts/task/')}\n## Door\n\n${door}\n\n## Review level\n\nmedium\n`)
  await steps(world, ['start', '140'], ['set', '140', 'approved', '--as', 'reviewer'], ['build', '140', '--by', 'lead'])
  const worktree = join(world.home, 'worktrees', '140')
  for (const line of ['one', 'two']) {
    appendFileSync(join(worktree, 'README.md'), `${line}\n`)
    git(worktree, ['commit', '-am', line])
  }
  await steps(
    world,
    ['set', '140', 'building', '--as', 'implementer'],
    ['set', '140', 'ready', '--as', 'implementer'],
    ['set', '140', 'approved', '--as', 'reviewer'],
  )
  const folder = join(world.home, 'tasks', '140')
  writeFileSync(join(folder, 'message.md'), MESSAGE)
  writeFileSync(join(folder, 'checked.md'), '# The proof of each test\n\n## one\n\n- **Break:** x\n')
  for (const [file, text] of [
    ['review-0.md', 'Round 0: changes.'],
    ['review-0-2.md', 'Round 0, pass 2: approved.'],
    ['review-1.md', 'Round 1: approved.'],
  ])
    writeFileSync(join(folder, file), text)
  return { worktree, folder }
}

/** The commits of the task's branch on `origin`, newest first, as `subject`. */
function originBranch(world) {
  git(world.repo, ['fetch', 'origin'])
  return git(world.repo, ['log', '--format=%s', 'origin/main..origin/task/140']).split('\n')
}

test('`task land <n>` squashes the branch into one commit on top of `origin/main`, with `message.md` as its message, and pushes it', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { worktree } = await approved(world)
  const landed = await run(['land', '140'], world.deps)
  assert.equal(landed.code, 0, landed.stderr)
  assert.deepEqual(originBranch(world), ['feat: the thing works'])
  assert.equal(git(worktree, ['log', '-1', '--format=%B']), MESSAGE.trim())
  assert.equal(git(worktree, ['rev-parse', 'HEAD~1']), git(world.repo, ['rev-parse', 'origin/main']))
})

test("`task land` opens the PR: its title is the message's header, its body holds the message, the door and `checked.md`, and each report goes to a comment of its own", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await approved(world)
  const landed = await run(['land', '140'], world.deps)
  assert.equal(landed.stdout, 'task 140: landed https://github.com/o/r/pull/1\n')
  const pr = world.gh.prs.get('task/140')
  assert.equal(pr.title, 'feat: the thing works')
  assert.match(pr.body, /^Closes #140\n\n## Summary\n\nWhat changed, and why\.\n\nAuthor API: none\.\n\n## Evidence\n/)
  assert.doesNotMatch(pr.body.split('## Evidence')[0], /Closes #140\n\n## Summary[\s\S]*Closes/)
  assert.match(pr.body, /## Evidence\n\n<details><summary>.*checked\.md.*<\/summary>\n\n# The proof of each test/)
  assert.match(pr.body, /\*\*Door:\*\* Two-way\. Only the task tool changes\./)
  assert.deepEqual(pr.labels, [])
  assert.deepEqual(
    world.gh.comments.map((comment) => comment.body.split('\n')[0]),
    ['<!-- binnacle-report: review-0.md -->', '<!-- binnacle-report: review-0-2.md -->', '<!-- binnacle-report: review-1.md -->'],
  )
  assert.match(world.gh.comments[2].body, /<details><summary>review-1\.md<\/summary>\n\nRound 1: approved\./)
})

test('A spec whose door is one-way gives its PR the label `one-way`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await approved(world, 'One-way. It moves a pin.')
  const landed = await run(['land', '140'], world.deps)
  assert.equal(landed.stdout, 'task 140: landed https://github.com/o/r/pull/1 (one-way)\n')
  assert.deepEqual(world.gh.prs.get('task/140').labels, ['one-way'])
})

test('`task land` refuses before a round after round 0 is approved, and when an input is missing or wrong, and changes nothing', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(141, world.shape('docs/'))
  await steps(world, ['start', '141'], ['set', '141', 'approved', '--as', 'reviewer'])
  const early = await run(['land', '141'], world.deps)
  assert.equal(early.code, 1)
  assert.match(early.stderr, /task 141 is approved at round 0; task land follows approved after round 0/)

  const { worktree, folder } = await approved(world)
  const head = git(worktree, ['rev-parse', 'HEAD'])
  const refuses = async (reason) => {
    const result = await run(['land', '140'], world.deps)
    assert.equal(result.code, 1, `${reason}: ${result.stdout}`)
    assert.match(result.stderr, reason)
    assert.equal(git(worktree, ['rev-parse', 'HEAD']), head)
    assert.deepEqual(world.gh.calls, [])
  }
  rmSync(join(folder, 'message.md'))
  await refuses(/no message\.md/)
  writeFileSync(join(folder, 'message.md'), '\nno header\n')
  await refuses(/its first line, the header, is empty/)
  writeFileSync(join(folder, 'message.md'), MESSAGE)
  rmSync(join(folder, 'checked.md'))
  await refuses(/no checked\.md/)
  writeFileSync(join(folder, 'checked.md'), 'proofs\n')
  rmSync(join(folder, 'review-1.md'))
  await refuses(/no review report of a round after round 0/)
  writeFileSync(join(folder, 'review-1.md'), 'Round 1.')
  world.setIssue(140, world.shape('scripts/task/'))
  await refuses(/the first word under ## Door is not One-way or Two-way/)
  world.setIssue(140, `${world.shape('scripts/task/')}\n## Door\n\nTwo-way.\n`)
  appendFileSync(join(worktree, 'README.md'), 'not committed\n')
  await refuses(/has changes that are not committed/)
  git(worktree, ['checkout', 'README.md'])
  // origin/main moves on, and the branch does not hold it.
  appendFileSync(join(world.repo, 'README.md'), 'main moves\n')
  git(world.repo, ['commit', '-am', 'main moves'])
  git(world.repo, ['push', 'origin', 'main'])
  await refuses(/task\/140 does not hold origin\/main/)
})

test('A `task land` that failed part of the way can run again: it finishes, and makes no second commit, PR or comment', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { worktree } = await approved(world)
  // GitHub takes the second comment, but its answer is lost.
  world.gh.failures.push({ match: (args) => args[1] === 'comment' && world.gh.comments.length === 1, lost: true })
  const first = await run(['land', '140'], world.deps)
  assert.equal(first.code, 1)
  assert.match(first.stderr, /task 140: land stopped at the reports: error connecting to api\.github\.com; run task land 140 again/)
  const squashed = git(worktree, ['rev-parse', 'HEAD'])

  const again = await run(['land', '140'], world.deps)
  assert.equal(again.code, 0, again.stderr)
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), squashed)
  assert.equal(world.gh.prs.size, 1)
  assert.equal(world.gh.calls.filter((call) => call.startsWith('pr create')).length, 1)
  assert.deepEqual(
    world.gh.comments.map((comment) => comment.body.split('\n')[0]),
    ['<!-- binnacle-report: review-0.md -->', '<!-- binnacle-report: review-0-2.md -->', '<!-- binnacle-report: review-1.md -->'],
  )
})

test('A squash whose commit fails puts the branch back as it was, so the next `task land` can run', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { worktree } = await approved(world)
  const head = git(worktree, ['rev-parse', 'HEAD'])
  const hooks = join(world.dir, 'hooks')
  mkdirSync(hooks)
  writeFileSync(join(hooks, 'commit-msg'), '#!/bin/sh\necho "the header is not conventional" >&2\nexit 1\n')
  chmodSync(join(hooks, 'commit-msg'), 0o755)
  git(world.repo, ['config', 'core.hooksPath', hooks])
  const failed = await run(['land', '140'], world.deps)
  assert.equal(failed.code, 1)
  assert.match(failed.stderr, /land stopped at the squash: the header is not conventional/)
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), head)
  assert.equal(git(worktree, ['status', '--porcelain']), '')

  git(world.repo, ['config', '--unset', 'core.hooksPath'])
  assert.equal((await run(['land', '140'], world.deps)).code, 0)
})

test("`task land` writes `landed` with the PR's address to the events log. A `task land` after it refuses, and names the PR", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { folder } = await approved(world)
  await run(['land', '140'], world.deps)
  const events = readFileSync(join(folder, 'events.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(events.at(-1).detail, { url: 'https://github.com/o/r/pull/1' })
  assert.equal(events.at(-1).event, 'landed')
  const second = await run(['land', '140'], world.deps)
  assert.equal(second.code, 1)
  assert.match(second.stderr, /task 140 has landed already: https:\/\/github\.com\/o\/r\/pull\/1/)
})

test('A resumed `task land` knows its squash by the message as Git keeps it, so a message that Git cleans makes no second commit', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { worktree, folder } = await approved(world)
  // Git keeps one blank line where the file has two, and drops trailing space.
  writeFileSync(join(folder, 'message.md'), 'feat: the thing works\n\n\nWhat changed.   \n\n\nCloses #140\n')
  world.gh.failures.push({ match: (args) => args[1] === 'comment', lost: false })
  assert.equal((await run(['land', '140'], world.deps)).code, 1)
  const squashed = git(worktree, ['rev-parse', 'HEAD'])
  // A second squash in the same second would make the same commit: wait past it.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  assert.equal((await run(['land', '140'], world.deps)).code, 0)
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), squashed)
})

test('A resumed `task land` makes no second commit when Git is set to keep a message verbatim', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const { worktree, folder } = await approved(world)
  git(world.repo, ['config', 'commit.cleanup', 'verbatim'])
  writeFileSync(join(folder, 'message.md'), 'feat: the thing works\n\n\nWhat changed.\n\n\nCloses #140\n')
  world.gh.failures.push({ match: (args) => args[1] === 'comment', lost: false })
  assert.equal((await run(['land', '140'], world.deps)).code, 1)
  const squashed = git(worktree, ['rev-parse', 'HEAD'])
  await new Promise((resolve) => setTimeout(resolve, 1100))
  assert.equal((await run(['land', '140'], world.deps)).code, 0)
  assert.equal(git(worktree, ['rev-parse', 'HEAD']), squashed)
})
