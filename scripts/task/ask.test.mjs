import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logLines, makeWorld } from './world.mjs'
import { run } from './task.mjs'

async function building(world, n, path) {
  world.setIssue(n, world.shape(path))
  assert.equal((await run(['start', String(n)], world.deps)).code, 0)
  await run(['set', String(n), 'approved', '--as', 'reviewer'], world.deps)
  await run(['set', String(n), 'building', '--as', 'implementer'], world.deps)
}

test('`task ask` sets `blocked`. `task answer` sets the state from before `blocked` again, at the same round', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140, 'scripts/task/')
  const folder = join(world.home, 'tasks', '140')

  const withoutQuestion = await run(['ask', '140', '--as', 'implementer'], world.deps)
  assert.equal(withoutQuestion.code, 1)
  assert.match(withoutQuestion.stderr, /no question\.md in .*140; write it first/)
  assert.equal(logLines(world, 140).at(-1).to, 'building')

  writeFileSync(join(folder, 'question.md'), 'Why?\n')
  world.tick()
  const asked = await run(['ask', '140', '--as', 'implementer'], world.deps)
  assert.equal(asked.code, 0)
  assert.deepEqual(logLines(world, 140).at(-1), {
    at: '2026-10-05T10:01:00.000Z',
    role: 'implementer',
    from: 'building',
    to: 'blocked',
    round: 0,
  })

  const askedAgain = await run(['ask', '140', '--as', 'lead'], world.deps)
  assert.equal(askedAgain.code, 1)
  assert.match(askedAgain.stderr, /blocked cannot follow blocked/)

  const withoutAnswer = await run(['answer', '140'], world.deps)
  assert.equal(withoutAnswer.code, 1)
  assert.match(withoutAnswer.stderr, /no answer\.md in .*140; write it first/)
  assert.equal(logLines(world, 140).at(-1).to, 'blocked')

  world.tick()
  writeFileSync(join(folder, 'answer.md'), 'Because.\n')
  const answered = await run(['answer', '140'], world.deps)
  assert.equal(answered.code, 0)
  assert.deepEqual(logLines(world, 140).at(-1), {
    at: '2026-10-05T10:02:00.000Z',
    role: 'lead',
    from: 'blocked',
    to: 'building',
    round: 0,
  })
  assert.equal(existsSync(join(folder, 'question.md')), false)
  assert.equal(existsSync(join(folder, 'answer.md')), false)
  assert.equal(readFileSync(join(folder, 'question-1.md'), 'utf8'), 'Why?\n')
  assert.equal(readFileSync(join(folder, 'answer-1.md'), 'utf8'), 'Because.\n')
})

test('A second question does not find the answer to the first one', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await building(world, 140, 'scripts/task/')
  const folder = join(world.home, 'tasks', '140')

  writeFileSync(join(folder, 'question.md'), 'Why?\n')
  await run(['ask', '140', '--as', 'implementer'], world.deps)
  writeFileSync(join(folder, 'answer.md'), 'Because.\n')
  await run(['answer', '140'], world.deps)

  writeFileSync(join(folder, 'question.md'), 'And now?\n')
  await run(['ask', '140', '--as', 'implementer'], world.deps)
  const stale = await run(['answer', '140'], world.deps)
  assert.equal(stale.code, 1)
  assert.match(stale.stderr, /no answer\.md in .*140; write it first/)
  assert.equal(logLines(world, 140).at(-1).to, 'blocked')

  writeFileSync(join(folder, 'answer.md'), 'Still because.\n')
  const answered = await run(['answer', '140'], world.deps)
  assert.equal(answered.code, 0)
  assert.equal(readFileSync(join(folder, 'question-2.md'), 'utf8'), 'And now?\n')
  assert.equal(readFileSync(join(folder, 'answer-2.md'), 'utf8'), 'Still because.\n')
  assert.equal(answered.stdout, 'task 140: building round 0; the answer is answer-2.md\n')
})
