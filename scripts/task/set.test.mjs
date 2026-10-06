import { test } from 'node:test'
import assert from 'node:assert/strict'
import { built, logLines, makeWorld } from './world.mjs'
import { run } from './task.mjs'

async function started(world, n) {
  world.spec(n)
  return run(['start', String(n)], world.deps)
}

function stateOf(world, n) {
  const last = logLines(world, n).at(-1)
  return { state: last.to, round: last.round }
}

test('The Reviewer sets `approved` or `changes` after round 0', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 140)).code, 0)
  world.tick()

  const approved = await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  assert.equal(approved.code, 0)
  assert.equal(approved.stdout, 'task 140: approved round 0\n')
  assert.deepEqual(stateOf(world, 140), { state: 'approved', round: 0 })
  assert.deepEqual(logLines(world, 140).at(-1), {
    at: '2026-10-05T10:01:00.000Z',
    role: 'reviewer',
    from: 'spec',
    to: 'approved',
    round: 0,
  })

  assert.equal((await started(world, 141)).code, 0)
  const changed = await run(['set', '141', 'changes', '--as', 'reviewer'], world.deps)
  assert.equal(changed.code, 0)
  assert.deepEqual(stateOf(world, 141), { state: 'changes', round: 0 })
})

test("The Implementer sets `building` on a Ticket, which begins at its Spec's approval, and `ready` when the tip is ready for a round", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140)

  const building = await run(['set', '140', 'building', '--as', 'implementer'], world.deps)
  assert.equal(building.code, 0)
  assert.equal(building.stdout, 'task 140: building round 0\n')
  assert.deepEqual(stateOf(world, 140), { state: 'building', round: 0 })

  const ready = await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)
  assert.equal(ready.code, 0)
  assert.equal(ready.stdout, 'task 140: ready round 1\n')
  assert.deepEqual(stateOf(world, 140), { state: 'ready', round: 1 })
})

test('Each `ready` starts the next round. The round number goes up by one', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140)
  await run(['set', '140', 'building', '--as', 'implementer'], world.deps)
  await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)

  // A later round: the Reviewer finds changes, and the Implementer answers with a new tip.
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  assert.deepEqual(stateOf(world, 140), { state: 'changes', round: 1 })
  await run(['set', '140', 'building', '--as', 'implementer'], world.deps)
  await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)
  assert.deepEqual(stateOf(world, 140), { state: 'ready', round: 2 })

  // `ready` can also follow `changes` after round 0, and still starts the next round.
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)
  assert.deepEqual(stateOf(world, 140), { state: 'ready', round: 3 })
})

test('A role that sets a state it does not own is refused, and the state does not change', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140)

  const byLead = await run(['set', '140', 'building'], world.deps)
  assert.equal(byLead.code, 1)
  assert.match(byLead.stderr, /the lead cannot set building; the implementer sets it/)
  assert.deepEqual(stateOf(world, 140), { state: 'approved', round: 0 })

  const byReviewer = await run(['set', '140', 'ready', '--as', 'reviewer'], world.deps)
  assert.equal(byReviewer.code, 1)
  assert.match(byReviewer.stderr, /the reviewer cannot set ready; the implementer sets it/)
  assert.deepEqual(stateOf(world, 140), { state: 'approved', round: 0 })

  const specByReviewer = await run(['set', '140', 'spec', '--as', 'reviewer'], world.deps)
  assert.equal(specByReviewer.code, 1)
  assert.match(specByReviewer.stderr, /the reviewer cannot set spec; the lead sets it/)
})

test('A state that cannot follow the current state is refused, and the error names the states that can follow', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 140)).code, 0)

  // At round 0, from spec, only the Reviewer's verdict follows.
  const fromSpec = await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)
  assert.equal(fromSpec.code, 1)
  assert.match(fromSpec.stderr, /ready cannot follow spec; changes, approved can follow it/)
  assert.deepEqual(stateOf(world, 140), { state: 'spec', round: 0 })

  // The Implementer cannot start before round 0 is approved.
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  const fromChanges = await run(['set', '140', 'building', '--as', 'implementer'], world.deps)
  assert.equal(fromChanges.code, 1)
  assert.match(fromChanges.stderr, /building cannot follow changes; spec can follow it/)

  // A Ticket has no Round 0 of its own, so `spec` never follows on it.
  await built(world, 141)
  await run(['set', '141', 'building', '--as', 'implementer'], world.deps)
  await run(['set', '141', 'ready', '--as', 'implementer'], world.deps)
  await run(['set', '141', 'changes', '--as', 'reviewer'], world.deps)
  const specOnTicket = await run(['set', '141', 'spec'], world.deps)
  assert.equal(specOnTicket.code, 1)
  assert.match(specOnTicket.stderr, /spec cannot follow changes; building, ready can follow it/)

  // After a later round's approval, nothing follows: the Lead takes the message and the PR.
  await run(['set', '141', 'ready', '--as', 'implementer'], world.deps)
  await run(['set', '141', 'approved', '--as', 'reviewer'], world.deps)
  const fromApproved = await run(['set', '141', 'building', '--as', 'implementer'], world.deps)
  assert.equal(fromApproved.code, 1)
  assert.match(fromApproved.stderr, /building cannot follow approved; nothing can follow it/)

  // `task set` cannot set what only `task ask` and `task stop` set.
  const blocked = await run(['set', '140', 'blocked', '--as', 'implementer'], world.deps)
  assert.equal(blocked.code, 1)
  assert.match(blocked.stderr, /task set cannot set blocked; only task ask sets it/)
})

test('The Lead sets `spec` again after an edit of the Spec at round 0', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 141)).code, 0)
  await run(['set', '141', 'changes', '--as', 'reviewer'], world.deps)

  const again = await run(['set', '141', 'spec'], world.deps)
  assert.equal(again.code, 0)
  assert.deepEqual(logLines(world, 141).at(-1), { at: '2026-10-05T10:00:00.000Z', role: 'lead', from: 'changes', to: 'spec', round: 0 })
})
