import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, git, makeWorld, SPEC, steps } from './world.mjs'
import { run } from './task.mjs'

async function byLead(world) {
  await built(world, 140, '--by', 'lead')
}

test('`task build <n> --by lead` records the Lead as the Implementer, and starts no agent', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await byLead(world)
  assert.deepEqual(
    world.runner.starts.map((agent) => agent.role),
    ['reviewer'],
  )
  const agents = JSON.parse(readFileSync(join(world.home, 'tasks', '140', 'agents.json'), 'utf8'))
  assert.equal(agents.implementer.runner, 'lead')
  assert.equal(world.runner.prompts.length, 1)
})

test('`task build --by lead` refuses when the Lead and the Reviewer are of the same family', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  const roles = join(world.repo, '.agents', 'roles.json')
  writeFileSync(roles, JSON.stringify({ ...JSON.parse(readFileSync(roles, 'utf8')), lead: { family: 'openai' } }))
  world.spec(SPEC)
  world.ticket(140, SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  const refused = await run(['build', '140', '--by', 'lead'], world.deps)
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /the builder and the reviewer are of the same family openai/)
})

test("A hand-off to an Implementer that is the Lead starts no agent, and wakes the Lead with the prompt's text", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await byLead(world)
  const worktree = join(world.home, 'worktrees', '140')
  appendFileSync(join(worktree, 'README.md'), 'one\n')
  git(worktree, ['commit', '-am', 'one'])
  await steps(
    world,
    ['set', '140', 'building', '--as', 'implementer'],
    ['set', '140', 'ready', '--as', 'implementer'],
    ['set', '140', 'changes', '--as', 'reviewer'],
  )
  assert.deepEqual(
    world.runner.prompts.map((prompt) => prompt.role),
    ['reviewer', 'reviewer'],
  )
  await run(['watch'], world.deps)
  const woken = await run(['watch'], world.deps)
  assert.match(woken.stdout, /^140 implementer \(lead\): Round 1 of #140 has findings: read .*review-1\.md/)
  const nothing = await run(['resend', '140'], world.deps)
  assert.equal(nothing.code, 1)
  assert.match(nothing.stderr, /no hand-off to resend/)
})

test('`task status` shows the Lead as the Implementer, and `task stop` and the watch leave it alone', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await byLead(world)
  const status = await run(['status', '140'], world.deps)
  assert.equal(status.code, 0)
  assert.match(status.stdout, /^ {2}implementer lead$/m)
  world.runner.states.reviewer = { state: 'idle' }
  const deps = { ...world.deps, sleep: async () => Promise.reject(new Error('nothing to report')) }
  await run(['watch'], world.deps)
  const quiet = await run(['watch'], deps)
  assert.equal(quiet.stderr, 'nothing to report\n')
  assert.equal((await run(['stop', '140', '--force'], world.deps)).code, 0)
  assert.deepEqual(world.runner.closed, [], "the Ticket's Reviewer had no Round, so it never started")
})
