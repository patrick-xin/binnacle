import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, git, logLines, makeWorld, SPEC, steps } from './world.mjs'
import { run } from './task.mjs'

function agentsOf(world, n) {
  return JSON.parse(readFileSync(join(world.home, 'tasks', String(n), 'agents.json'), 'utf8'))
}

async function ready(world, n) {
  const worktree = join(world.home, 'worktrees', String(n))
  appendFileSync(join(worktree, 'README.md'), `${n}\n`)
  git(worktree, ['commit', '-am', String(n)])
  await steps(world, ['set', String(n), 'building', '--as', 'implementer'], ['set', String(n), 'ready', '--as', 'implementer'])
}

test("A Ticket's Rounds go to its Spec's Reviewer, in the Spec's checkout, and no other Reviewer starts", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140, '--by', 'lead')
  assert.equal(existsSync(join(world.home, 'worktrees', '140-review')), false)

  await ready(world, 140)

  assert.deepEqual(
    world.runner.starts.map((agent) => `${agent.role} ${agent.cwd}`),
    [`reviewer ${join(world.home, 'worktrees', `${SPEC}-review`)}`],
  )
  assert.match(
    world.runner.prompts.at(-1).text,
    new RegExp(
      `^Round 1 of the Ticket #140 at \\w+: .*In your checkout ${join(world.home, 'worktrees', `${SPEC}-review`)}, .*Write the report to ${join(world.home, 'tasks', '140', 'review-1.md')}`,
    ),
  )
  assert.deepEqual(agentsOf(world, 140).reviewer, { role: 'reviewer', of: SPEC })
  const status = await run(['status', '140'], world.deps)
  assert.match(status.stdout, new RegExp(`^ {2}reviewer of the Spec ${SPEC}$`, 'm'))
})

test("A Ticket whose Spec's Reviewer is gone starts it again, from the Spec's own setting, and it continues its session", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140, '--by', 'lead')
  const sessions = join(world.home, 'tasks', String(SPEC), 'agents', 'reviewer', 'sessions')
  mkdirSync(sessions, { recursive: true })
  writeFileSync(join(sessions, '2026-10-05T10-00-00_a.jsonl'), '{}\n')
  world.runner.states.reviewer = { state: 'gone' }

  await ready(world, 140)

  const again = world.runner.starts.at(-1)
  assert.equal(world.runner.starts.length, 2)
  assert.equal(again.sessionDir, join(world.home, 'tasks', String(SPEC), 'agents', 'reviewer', 'sessions'))
  assert.equal(again.cwd, join(world.home, 'worktrees', `${SPEC}-review`))
  assert.equal(again.model, 'openai-codex/gpt-6.1-sol')
  assert.equal(again.resume, true, 'it continues the session that it had')
  assert.equal(agentsOf(world, SPEC).reviewer.startedAt, '2026-10-05T10:05:00.000Z')
})

test("`task build --fresh-reviewer` gives the Ticket a Reviewer of its own, forked from the Spec Reviewer's session", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  const sessions = join(world.home, 'tasks', String(SPEC), 'agents', 'reviewer', 'sessions')
  mkdirSync(sessions, { recursive: true })
  writeFileSync(join(sessions, '2026-10-05T10-00-00_a.jsonl'), '{}\n')
  writeFileSync(join(sessions, '2026-10-05T10-01-00_b.jsonl'), '{}\n')
  world.ticket(140, SPEC)

  await steps(world, ['build', '140', '--by', 'lead', '--fresh-reviewer'])
  await ready(world, 140)

  const forked = world.runner.starts.at(-1)
  assert.equal(forked.cwd, join(world.home, 'worktrees', '140-review'))
  assert.equal(forked.fork, join(sessions, '2026-10-05T10-01-00_b.jsonl'))
  assert.equal(forked.sessionDir, join(world.home, 'tasks', '140', 'agents', 'reviewer', 'sessions'))
  assert.match(world.runner.prompts.at(-1).text, /^You are the Reviewer\. .*Round 1 of the Ticket #140/)
})

test('`task build --fresh-reviewer` refuses a Spec whose Reviewer has no session, and goes with no `--reviewer`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.ticket(140, SPEC)
  const none = await run(['build', '140', '--fresh-reviewer'], world.deps)
  assert.equal(none.code, 1)
  assert.match(none.stderr, /the Spec 100's Reviewer has no session to fork/)
  const both = await run(['build', '140', '--fresh-reviewer', '--reviewer', 'herdr:google/gemini-3-pro'], world.deps)
  assert.equal(both.code, 2)
})

test("`task stop <ticket>` leaves its Spec's Reviewer and checkout, and `task stop <spec>` refuses while a Ticket of it runs", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140, '--by', 'lead')

  const early = await run(['stop', String(SPEC)], world.deps)
  assert.equal(early.code, 1)
  assert.match(early.stderr, /the Ticket 140 of the Spec 100 is not stopped; stop it first, or pass --force/)

  await steps(world, ['stop', '140', '--force'])
  assert.deepEqual(world.runner.closed, [])
  assert.equal(existsSync(join(world.home, 'worktrees', `${SPEC}-review`)), true)

  await steps(world, ['stop', String(SPEC)])
  assert.deepEqual(world.runner.closed, ['reviewer'])
  assert.equal(existsSync(join(world.home, 'worktrees', `${SPEC}-review`)), false)
})

test('An approved Spec goes back to `spec` for another pass of Round 0, until a Ticket of it is built', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'], ['set', String(SPEC), 'spec'])

  assert.deepEqual(logLines(world, SPEC).at(-1), { at: '2026-10-05T10:03:00.000Z', role: 'lead', from: 'approved', to: 'spec', round: 0 })
  assert.match(world.runner.prompts.at(-1).text, /^Round 0, pass 2 of #100: .*review-0-2\.md/)

  await steps(world, ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.ticket(140, SPEC)
  await steps(world, ['build', '140', '--by', 'lead'])
  const late = await run(['set', String(SPEC), 'spec'], world.deps)
  assert.equal(late.code, 1)
  assert.match(late.stderr, /task 100: the Ticket 140 is built from it; the Spec stays approved/)
})
