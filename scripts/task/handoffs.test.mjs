import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffFor, reportFile } from './handoffs.mjs'

const task = { n: 140, folder: '/h/tasks/140', worktree: '/h/worktrees/140', review: '/h/worktrees/140-review', round: 0, pass: 1 }

test('the report file names each pass of round 0 and each later round', () => {
  assert.deepEqual(
    [reportFile(0, 1), reportFile(0, 2), reportFile(0, 3), reportFile(1, 1), reportFile(2, 4)],
    ['review-0.md', 'review-0-2.md', 'review-0-3.md', 'review-1.md', 'review-2.md'],
  )
})

test('`ready` sends the Reviewer the round, the tip, the commits since the last round and the report file', () => {
  const handoff = handoffFor({ kind: 'set', to: 'ready' }, { ...task, round: 2, tip: 'b2', base: 'a1' })
  assert.equal(handoff.role, 'reviewer')
  assert.equal(handoff.start, false)
  assert.equal(
    handoff.text,
    'Round 2 of #140 at b2: the commits a1..b2. In your checkout /h/worktrees/140-review, run `git switch --detach b2`, install again only if the lockfile changed, and run `pnpm test`. Check each finding of the last round first, then what the commits touched. Write the report to /h/tasks/140/review-2.md, then set the state with `pnpm task set 140 changes` or `pnpm task set 140 approved`, and end your turn.',
  )
})

test('each change hands the task to the role that acts next, or to no agent', () => {
  const to = (change, c = {}, asker) => handoffFor(change, { ...task, ...c }, asker)?.role ?? 'the Lead'
  assert.deepEqual(
    [
      to({ kind: 'start' }),
      to({ kind: 'set', to: 'spec' }, { pass: 2 }),
      to({ kind: 'set', to: 'changes' }),
      to({ kind: 'set', to: 'approved' }),
      to({ kind: 'build' }),
      to({ kind: 'set', to: 'building' }),
      to({ kind: 'set', to: 'changes' }, { round: 1 }),
      to({ kind: 'set', to: 'approved' }, { round: 1 }),
      to({ kind: 'answer' }, { k: 1 }, 'implementer'),
    ],
    ['reviewer', 'reviewer', 'the Lead', 'the Lead', 'implementer', 'the Lead', 'implementer', 'implementer', 'implementer'],
  )
  assert.match(handoffFor({ kind: 'set', to: 'spec' }, { ...task, pass: 2 }).text, /pass 2 .*review-0-2\.md/)
  assert.match(handoffFor({ kind: 'set', to: 'approved' }, { ...task, round: 1 }).text, /message\.md/)
  assert.match(handoffFor({ kind: 'answer' }, { ...task, k: 2 }, 'reviewer').text, /answer-2\.md/)
})
