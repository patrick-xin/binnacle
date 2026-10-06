import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, git, makeWorld, SPEC, steps } from './world.mjs'
import { run } from './task.mjs'

function events(world, n) {
  const path = join(world.home, 'tasks', String(n), 'events.ndjson')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function building(world, n) {
  await built(world, n)
}

function commit(world, n, message) {
  const worktree = join(world.home, 'worktrees', String(n))
  appendFileSync(join(worktree, 'README.md'), `${message}\n`)
  git(worktree, ['commit', '-am', message])
  return git(worktree, ['rev-parse', 'HEAD'])
}

test("`task start <n>` makes the Reviewer's checkout, starts the Reviewer with the runner and the model that `.agents/roles.json` names, and sends it round 0", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  await steps(world, ['start', '140'])

  const review = join(world.home, 'worktrees', '140-review')
  assert.equal(git(review, ['rev-parse', 'HEAD']), git(world.repo, ['rev-parse', 'origin/main']))
  const [agent] = world.runner.starts
  assert.deepEqual(agent, {
    n: 140,
    role: 'reviewer',
    tool: 'pi',
    model: 'openai-codex/gpt-6.1-sol',
    thinking: 'medium',
    cwd: review,
    sessionDir: join(world.home, 'tasks', '140', 'agents', 'reviewer', 'sessions'),
    env: { BINNACLE_TASK: '140', BINNACLE_ROLE: 'reviewer' },
  })
  assert.equal(world.runner.prompts.length, 1)
  assert.equal(world.runner.prompts[0].role, 'reviewer')
  assert.match(world.runner.prompts[0].text, /^You are the Reviewer\. .*Round 0 of the Spec #140.*tasks\/140\/review-0\.md/)
  assert.deepEqual(
    events(world, 140).map((event) => `${event.event} ${event.role} ${event.detail.id}`),
    ['handoff reviewer h1', 'started reviewer h1', 'prompted reviewer h1'],
  )
})

test('`task build <ticket>` starts the Implementer with the runner and the model that `.agents/roles.json` names, and sends it the Ticket', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await built(world, 140)
  assert.deepEqual(
    world.runner.starts.map((agent) => `${agent.role} ${agent.model} ${agent.cwd}`),
    [
      `reviewer openai-codex/gpt-6.1-sol ${join(world.home, 'worktrees', `${SPEC}-review`)}`,
      `implementer zai/glm-5.3 ${join(world.home, 'worktrees', '140')}`,
    ],
  )
  assert.match(world.runner.prompts.at(-1).text, /^You are the Implementer\. .*Build the Ticket #140/)
})

test('Each agent that the tool starts knows its task and its role, so `task set` needs no `--as`', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  const implementer = { ...world.deps, env: { BINNACLE_TASK: '140', BINNACLE_ROLE: 'implementer' } }
  const set = await run(['set', 'building'], implementer)
  assert.equal(set.code, 0, set.stderr)
  assert.equal(set.stdout, 'task 140: building round 0\n')
  const mixed = await run(['set', 'ready', '--as', 'reviewer'], implementer)
  assert.equal(mixed.code, 1)
  assert.match(mixed.stderr, /--as reviewer differs from BINNACLE_ROLE implementer/)
})

test('A state that hands the task on sends the hand-off to the next role: `ready` sends the tip to the Reviewer, and `changes` after round 0 sends the report to the Implementer', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  const base = git(world.repo, ['rev-parse', 'origin/main'])
  const first = commit(world, 140, 'one')
  await steps(world, ['set', '140', 'building', '--as', 'implementer'], ['set', '140', 'ready', '--as', 'implementer'])
  const review = world.runner.prompts.at(-1)
  assert.equal(review.role, 'reviewer')
  assert.match(
    review.text,
    new RegExp(`^You are the Reviewer\\. .*Round 1 of the Ticket #140 at ${first}: the commits ${base}\\.\\.${first}\\..*review-1\\.md`),
  )

  await steps(world, ['set', '140', 'changes', '--as', 'reviewer'])
  assert.equal(world.runner.prompts.at(-1).role, 'implementer')
  assert.match(world.runner.prompts.at(-1).text, /^Round 1 of #140 has findings: read .*tasks\/140\/review-1\.md in full/)

  const second = commit(world, 140, 'two')
  await steps(world, ['set', '140', 'ready', '--as', 'implementer'])
  assert.match(
    world.runner.prompts.at(-1).text,
    new RegExp(`^Round 2 of the Ticket #140 at ${second}: the commits ${first}\\.\\.${second}\\.`),
  )
})

test('`approved` after round 0 asks the Implementer for `message.md`, and wakes the Lead', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  commit(world, 140, 'one')
  await steps(
    world,
    ['set', '140', 'building', '--as', 'implementer'],
    ['set', '140', 'ready', '--as', 'implementer'],
    ['set', '140', 'approved', '--as', 'reviewer'],
  )
  assert.equal(world.runner.prompts.at(-1).role, 'implementer')
  assert.match(world.runner.prompts.at(-1).text, /^Round 1 of #140 is approved\. Write .*tasks\/140\/message\.md/)
  assert.equal((await run(['watch'], world.deps)).stdout, `${SPEC} approved round 0 (reviewer)\n`)
  assert.equal((await run(['watch'], world.deps)).stdout, '140 approved round 1 (reviewer)\n')
})

test('`task answer` sends the answer to the role that asked', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  const folder = join(world.home, 'tasks', '140')
  writeFileSync(join(folder, 'question.md'), 'Which seam?\n')
  await steps(world, ['ask', '140', '--as', 'implementer'])
  writeFileSync(join(folder, 'answer.md'), 'The command.\n')
  await steps(world, ['answer', '140'])
  assert.equal(world.runner.prompts.at(-1).role, 'implementer')
  assert.match(world.runner.prompts.at(-1).text, /read .*tasks\/140\/answer-1\.md/)
})

test('Setting `spec` again at round 0 sends the spec to the Reviewer for its next pass, and names a new report file', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  await steps(world, ['start', '140'], ['set', '140', 'changes', '--as', 'reviewer'], ['set', '140', 'spec', '--as', 'lead'])
  assert.equal(world.runner.prompts.length, 2)
  assert.match(world.runner.prompts[1].text, /^Round 0, pass 2 of #140: .*tasks\/140\/review-0-2\.md/)
  assert.equal(world.runner.starts.length, 1)
})

test('A change that the Lead sets does not wake the Lead', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  await steps(world, ['start', '140'])
  // The Lead asks, and answers, a question of its own: `blocked` by the Lead.
  const folder = join(world.home, 'tasks', '140')
  writeFileSync(join(folder, 'question.md'), 'Is the spec right?\n')
  await steps(world, ['ask', '140', '--as', 'lead'])
  writeFileSync(join(folder, 'answer.md'), 'Yes.\n')
  await steps(world, ['answer', '140'], ['set', '140', 'changes', '--as', 'reviewer'])
  assert.equal((await run(['watch'], world.deps)).stdout, '140 changes round 0 (reviewer)\n')
  const counts = JSON.parse(readFileSync(join(world.home, 'tasks', 'watch.json'), 'utf8'))
  assert.deepEqual(counts[140], { log: 4, events: 0 })
})

test('A prompt that did not land fails the hand-off: the command exits 3, the change stays, and the watch tells the Lead', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  commit(world, 140, 'one')
  await steps(world, ['set', '140', 'building', '--as', 'implementer'])
  world.runner.failPrompt.add('reviewer')
  const ready = await run(['set', '140', 'ready', '--as', 'implementer'], world.deps)
  assert.equal(ready.code, 3)
  assert.equal(ready.stdout, 'task 140: ready round 1\n')
  assert.match(ready.stderr, /task 140: the hand-off h2 to the reviewer failed: agent_prompt_stalled; run task resend 140/)
  assert.equal((await run(['status', '140'], world.deps)).stdout.split('\n')[0].startsWith('140 ready round 1'), true)
  await run(['watch'], world.deps)
  assert.equal((await run(['watch'], world.deps)).stdout, '140 reviewer hand-off h2 failed: agent_prompt_stalled\n')
})

test('`task resend <n>` sends the hand-off of the last change again, and starts the agent first if it is not running', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(SPEC)
  world.ticket(140, SPEC)
  await steps(world, ['start', String(SPEC)], ['set', String(SPEC), 'approved', '--as', 'reviewer'])
  world.runner.failStart.add('implementer')
  assert.equal((await run(['build', '140'], world.deps)).code, 3)
  world.runner.failStart.delete('implementer')

  const resent = await run(['resend', '140'], world.deps)
  assert.equal(resent.code, 0, resent.stderr)
  assert.equal(resent.stdout, 'task 140: resend h1 to the implementer\n')
  assert.equal(world.runner.starts.at(-1).role, 'implementer')
  assert.match(world.runner.prompts.at(-1).text, /^You are the Implementer\./)
  assert.deepEqual(
    events(world, 140)
      .filter((event) => event.detail?.id === 'h1')
      .map((event) => event.event),
    ['handoff', 'handoff-failed', 'started', 'prompted'],
  )
  const nothing = await run(['resend', '140'], world.deps)
  assert.equal(nothing.code, 1)
  assert.match(nothing.stderr, /task 140 has no hand-off to resend/)
})

test('A hand-off that no command sent, because the command stopped after the change, is reported by the watch', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  await steps(world, ['start', '140'])
  // A command that stopped after it wrote its hand-off, before it tried it.
  appendFileSync(
    join(world.home, 'tasks', '140', 'events.ndjson'),
    `${JSON.stringify({ at: '2026-10-05T10:05:00.000Z', event: 'handoff', role: 'reviewer', detail: { id: 'h2', start: false, text: 'round 0' } })}\n`,
  )
  assert.equal((await run(['watch'], world.deps)).stdout, '140 reviewer hand-off h2 was not sent; run task resend 140\n')
})

test('`task status` shows a folder that it cannot read as one line with the reason, and still shows each other task', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  await steps(world, ['start', '140'])
  const old = join(world.home, 'tasks', '133')
  mkdirSync(old)
  writeFileSync(join(old, 'state'), 'ready\n')
  const all = await run(['status'], world.deps)
  assert.equal(all.code, 0)
  assert.equal(all.stdout.split('\n')[0], `133 unreadable: ${old}: no task folder`)
  assert.match(all.stdout, /^140 spec round 0/m)
  const one = await run(['status', '133'], world.deps)
  assert.equal(one.code, 1)
})

test('`task stop` closes each agent of the task, and its pane or its run', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140)
  commit(world, 140, 'one')
  await steps(world, ['set', '140', 'building', '--as', 'implementer'], ['set', '140', 'ready', '--as', 'implementer'])
  assert.equal((await run(['stop', '140', '--force'], world.deps)).code, 0)
  assert.deepEqual(world.runner.closed.toSorted(), ['implementer', 'reviewer'])
  assert.deepEqual(
    events(world, 140)
      .filter((event) => event.event === 'closed')
      .map((event) => event.role)
      .toSorted(),
    ['implementer', 'reviewer'],
  )
})

test('`task status` shows a task whose events or agents cannot be read as one line, and still shows each other task', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.spec(140)
  world.spec(141)
  await steps(world, ['start', '140'], ['start', '141'])
  const folder = join(world.home, 'tasks', '140')
  const whole = readFileSync(join(folder, 'events.ndjson'), 'utf8')
  for (const [file, text, reason] of [
    ['events.ndjson', `${whole}not json\n`, /events\.ndjson: line 4 is not JSON/],
    ['agents.json', '{ broken', /agents\.json/],
  ]) {
    const kept = existsSync(join(folder, file)) ? readFileSync(join(folder, file), 'utf8') : undefined
    writeFileSync(join(folder, file), text)
    const all = await run(['status'], world.deps)
    assert.equal(all.code, 0, file)
    const [first, ...rest] = all.stdout.split('\n')
    assert.match(first, /^140 unreadable: /, file)
    assert.match(first, reason, file)
    assert.match(rest.join('\n'), /^141 spec round 0/m, file)
    if (kept !== undefined) writeFileSync(join(folder, file), kept)
  }
})
