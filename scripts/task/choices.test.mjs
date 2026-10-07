import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, git, makeWorld, SPEC, steps } from './world.mjs'
import { run } from './task.mjs'

function agentsOf(world, n) {
  return JSON.parse(readFileSync(join(world.home, 'tasks', String(n), 'agents.json'), 'utf8'))
}

async function ready(world, n) {
  const worktree = join(world.home, 'worktrees', String(n))
  appendFileSync(join(worktree, 'README.md'), 'one\n')
  git(worktree, ['commit', '-am', 'one'])
  await steps(world, ['set', String(n), 'building', '--as', 'implementer'], ['set', String(n), 'ready', '--as', 'implementer'])
}

test('`task start <spec> --reviewer headless:<model>` and `task build --by pi:<model>` name the model of a pi agent, and its family comes from its provider', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(
    world,
    ['start', String(SPEC), '--reviewer', 'headless:google/gemini-3-pro'],
    ['set', String(SPEC), 'approved', '--as', 'reviewer'],
  )
  const { handle: _handle, startedAt: _startedAt, ...setting } = agentsOf(world, SPEC).reviewer
  assert.deepEqual(setting, {
    role: 'reviewer',
    runner: 'headless',
    tool: 'pi',
    model: 'google/gemini-3-pro',
    family: 'google',
    thinking: 'medium',
  })
  world.ticket(140, SPEC)
  await steps(world, ['build', '140', '--by', 'pi:zai/glm-5.3'])
  const { implementer, reviewer } = agentsOf(world, 140)
  assert.equal(`${implementer.runner} ${implementer.tool} ${implementer.model} ${implementer.family}`, 'fake pi zai/glm-5.3 zai')
  assert.deepEqual(reviewer, { role: 'reviewer', of: SPEC }, "a Ticket's Reviewer is its Spec's")
})

test('`task build` refuses a builder and a Reviewer of one family, unless it gets `--same-family`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.ticket(140, SPEC)
  const refused = await run(['build', '140', '--by', 'pi:openai-codex/gpt-6-luna'], world.deps)
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /the builder and the reviewer are of the same family openai; choose another, or pass --same-family/)

  const subagents = await run(['build', '140', '--by', 'subagent:sonnet', '--reviewer', 'subagent:opus'], world.deps)
  assert.equal(subagents.code, 1)
  assert.match(subagents.stderr, /of the same family anthropic/)

  await steps(world, ['build', '140', '--by', 'pi:openai-codex/gpt-6-luna', '--same-family'])
  assert.equal(agentsOf(world, 140).implementer.model, 'openai-codex/gpt-6-luna')
})

test('`task build` refuses a model whose provider has no family, and a choice that is not `<runner>:<model>`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.ticket(140, SPEC)
  const unknown = await run(['build', '140', '--by', 'pi:mistral/large'], world.deps)
  assert.equal(unknown.code, 1)
  assert.match(unknown.stderr, /mistral\/large: no family for the provider mistral; add it to families in .agents\/roles.json/)
  for (const by of ['pi', 'codex:o9', 'subagent:']) {
    const bad = await run(['build', '140', '--by', by], world.deps)
    assert.equal(bad.code, 2, by)
    assert.match(bad.stderr, /the implementer is lead, subagent:<model> or pi:<model>/)
  }
})

test("`task build --by subagent:<model>` starts no agent: it records the subagent, and gives the Lead the Implementer's prompt", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.ticket(140, SPEC)
  const startsBefore = world.runner.starts.length

  const result = await run(['build', '140', '--by', 'subagent:sonnet'], world.deps)

  assert.equal(result.code, 0, result.stderr)
  assert.equal(world.runner.starts.length, startsBefore)
  assert.match(
    result.stdout.split('\n')[1],
    /^task 140: for the implementer \(subagent\): You are the Implementer\. .*Build the Ticket #140/,
  )
  const { implementer } = agentsOf(world, 140)
  assert.equal(
    `${implementer.runner} ${implementer.tool} ${implementer.model} ${implementer.family}`,
    'subagent claude-code sonnet anthropic',
  )
  const status = await run(['status', '140'], world.deps)
  assert.match(status.stdout, /^ {2}implementer subagent sonnet$/m)
  assert.match(status.stdout, /^ {2}reviewer of the Spec 100$/m)
})

test('A Reviewer chosen for the Ticket starts at its first `ready`, in its own checkout, and that prompt tells it its role', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140, '--by', 'lead', '--reviewer', 'herdr:google/gemini-3-pro')
  assert.deepEqual(
    world.runner.starts.map((agent) => `${agent.role} ${agent.cwd}`),
    [`reviewer ${join(world.home, 'worktrees', `${SPEC}-review`)}`],
  )
  await ready(world, 140)
  assert.equal(world.runner.starts.at(-1).cwd, join(world.home, 'worktrees', '140-review'))
  assert.match(world.runner.prompts.at(-1).text, /^You are the Reviewer\. Load the reviewer skill .* Round 1 of the Ticket #140 at /)
})

test('A hand-off to a subagent wakes the Lead with its prompt, and names the subagent', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140, '--by', 'lead', '--reviewer', 'subagent:opus', '--same-family')
  await ready(world, 140)
  await run(['watch'], world.deps)
  const woken = await run(['watch'], world.deps)
  assert.match(woken.stdout, /^140 reviewer \(subagent\): You are the Reviewer\. .*Round 1 of the Ticket #140/)
})
