import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeWorld } from './world.mjs'
import { run } from './task.mjs'

test('Each change of state adds one line to `log.ndjson`: the time, the role, the state before, the state after and the round', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  const folder = join(world.home, 'tasks', '140')

  const steps = [
    [['set', '140', 'changes', '--as', 'reviewer'], 1],
    [['set', '140', 'spec'], 2],
    [['set', '140', 'approved', '--as', 'reviewer'], 3],
    [['set', '140', 'building', '--as', 'implementer'], 4],
    [['set', '140', 'ready', '--as', 'implementer'], 5],
    [['set', '140', 'changes', '--as', 'reviewer'], 6],
  ]
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  for (const [argv, minutes] of steps) {
    world.tick()
    assert.equal((await run(argv, world.deps)).code, 0, `${argv.join(' ')} at minute ${minutes}`)
  }

  assert.deepEqual(
    readFileSync(join(folder, 'log.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
    [
      { at: '2026-10-05T10:00:00.000Z', role: 'lead', from: null, to: 'spec', round: 0 },
      { at: '2026-10-05T10:01:00.000Z', role: 'reviewer', from: 'spec', to: 'changes', round: 0 },
      { at: '2026-10-05T10:02:00.000Z', role: 'lead', from: 'changes', to: 'spec', round: 0 },
      { at: '2026-10-05T10:03:00.000Z', role: 'reviewer', from: 'spec', to: 'approved', round: 0 },
      { at: '2026-10-05T10:04:00.000Z', role: 'implementer', from: 'approved', to: 'building', round: 0 },
      { at: '2026-10-05T10:05:00.000Z', role: 'implementer', from: 'building', to: 'ready', round: 1 },
      { at: '2026-10-05T10:06:00.000Z', role: 'reviewer', from: 'ready', to: 'changes', round: 1 },
    ],
  )
})

test('`task status` shows each task, its state, its round, and the time since its last change', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  world.setIssue(141, world.shape('docs/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  assert.equal((await run(['start', '141'], world.deps)).code, 0)

  world.tick(120_000)
  await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  world.tick(3_600_000)
  world.tick(3_600_000)

  const all = await run(['status'], world.deps)
  assert.equal(all.code, 0)
  assert.equal(
    all.stdout,
    [
      '140 approved round 0 (2h ago)',
      '  reviewer fake idle, last session record 2h2m ago',
      '141 spec round 0 (2h2m ago)',
      '  reviewer fake idle, last session record 2h2m ago',
      '',
    ].join('\n'),
  )

  const one = await run(['status', '141'], world.deps)
  assert.equal(one.code, 0)
  assert.equal(one.stdout, '141 spec round 0 (2h2m ago)\n  reviewer fake idle, last session record 2h2m ago\n')

  const none = await run(['status', '999'], world.deps)
  assert.equal(none.code, 1)
  assert.match(none.stderr, /no task 999/)
})
