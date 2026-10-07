import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { built, makeWorld, SPEC } from './world.mjs'
import { cpuSeconds, run } from './task.mjs'

async function working(world) {
  await built(world, 140)
  world.tick()
  assert.equal((await run(['set', '140', 'building', '--as', 'implementer'], world.deps)).code, 0)
  // The Lead heard of the Spec's approval.
  assert.equal((await run(['watch'], world.deps)).stdout, `${SPEC} approved round 0 (reviewer)\n`)
  world.runner.states.implementer = { state: 'working', root: 100 }
}

function record(world) {
  const sessions = join(world.home, 'tasks', '140', 'agents', 'implementer', 'sessions')
  mkdirSync(sessions, { recursive: true })
  const file = join(sessions, '2026-10-05_140-implementer.jsonl')
  writeFileSync(file, '{}\n', { flag: 'a' })
  utimesSync(file, world.deps.now(), world.deps.now())
}

function minutes(world, max, also = () => {}) {
  let slept = 0
  return {
    ...world.deps,
    sleep: async () => {
      slept += 1
      if (slept > max) throw new Error(`no report after ${max} minutes`)
      world.tick(60_000)
      also(slept)
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}

test('`task watch` reports an agent that works and has written no session record for 20 minutes', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  record(world)
  const result = await run(['watch'], minutes(world, 30))
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, '140 implementer stalled: no session record for 20 min\n')
})

test("With no session file yet, the time is counted from the agent's last prompt", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  // Ten minutes after its start, the Implementer got a second prompt.
  world.tick(10 * 60_000)
  const prompted = world.deps.now()
  appendFileSync(
    join(world.home, 'tasks', '140', 'events.ndjson'),
    `${JSON.stringify({ at: prompted.toISOString(), event: 'prompted', role: 'implementer', detail: { id: 'h9' } })}\n`,
  )
  const result = await run(['watch'], minutes(world, 30))
  assert.equal(result.stdout, '140 implementer stalled: no session record for 20 min\n')
  assert.equal(world.deps.now().getTime() - prompted.getTime(), 20 * 60_000)
})

test('`task watch` reports an agent sooner, after 5 minutes, when a process under the agent used the CPU for at least 4 of those 5 minutes, and names it', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  record(world)
  let cpu = 0
  // The pane's shell 100 runs pi 150, which runs a test 200 that spins.
  world.deps.processes = async () => [
    { pid: 100, ppid: 1, command: '-zsh', cpuSeconds: 1 },
    { pid: 150, ppid: 100, command: 'pi', cpuSeconds: 20 },
    { pid: 200, ppid: 150, command: 'node --test scripts/task/watch.test.mjs', cpuSeconds: cpu },
    { pid: 300, ppid: 1, command: 'node --test elsewhere', cpuSeconds: cpu * 2 },
  ]
  const result = await run(
    ['watch'],
    minutes(world, 30, () => (cpu += 58)),
  )
  assert.equal(
    result.stdout,
    '140 implementer stalled: no session record for 5 min; busy 200 node --test scripts/task/watch.test.mjs, cpu 4:50 in 5 min\n',
  )
})

test("The agent's own process is not busy: an agent that thinks for minutes, with its session records recent, is not reported", async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  record(world)
  let cpu = 0
  // The pane's shell 100 runs pi 150, which thinks: it uses the CPU, and writes a session record each minute.
  world.deps.processes = async () => [
    { pid: 100, ppid: 1, command: '-zsh', cpuSeconds: 1 },
    { pid: 150, ppid: 100, command: 'pi', cpuSeconds: cpu },
  ]
  const result = await run(
    ['watch'],
    minutes(world, 10, () => {
      cpu += 58
      record(world)
    }),
  )
  assert.equal(result.code, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /no report after 10 minutes/)
})

test('A stall is reported once, until the agent writes a new session record and stalls again', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  record(world)
  assert.equal((await run(['watch'], minutes(world, 30))).stdout, '140 implementer stalled: no session record for 20 min\n')

  // The same stall again: no report, until the Reviewer's change at minute 5.
  const log = join(world.home, 'tasks', '140', 'log.ndjson')
  const next = await run(
    ['watch'],
    minutes(world, 10, (slept) => {
      if (slept === 5)
        appendFileSync(
          log,
          `${JSON.stringify({ at: world.deps.now().toISOString(), role: 'implementer', from: 'building', to: 'blocked', round: 0 })}\n`,
        )
    }),
  )
  assert.equal(next.stdout, '140 blocked round 0 (implementer)\n')

  // A new record, then 20 quiet minutes: a new stall.
  record(world)
  assert.equal((await run(['watch'], minutes(world, 30))).stdout, '140 implementer stalled: no session record for 20 min\n')
})

test('`task watch` reports an agent that waits in its pane, and a headless run that timed out', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  world.runner.states.implementer = { state: 'blocked' }
  assert.equal((await run(['watch'], world.deps)).stdout, '140 implementer waits in its pane\n')
  appendFileSync(
    join(world.home, 'tasks', '140', 'events.ndjson'),
    `${JSON.stringify({ at: '2026-10-05T11:00:00.000Z', event: 'timed-out', role: 'reviewer', detail: { prompt: 'a.txt', minutes: 45 } })}\n`,
  )
  assert.equal((await run(['watch'], world.deps)).stdout, '140 reviewer run timed out after 45 min\n')
})

test('the CPU time that `ps` prints reads as seconds', () => {
  assert.deepEqual(
    [cpuSeconds('0:00.03'), cpuSeconds('12:34.50'), cpuSeconds('01:02:03'), cpuSeconds('1-02:03:04')],
    [0.03, 754.5, 3723, 93_784],
  )
})

test('`task watch` reports a headless run that could not start', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await working(world)
  appendFileSync(
    join(world.home, 'tasks', '140', 'events.ndjson'),
    `${JSON.stringify({ at: '2026-10-05T11:00:00.000Z', event: 'run-failed', role: 'reviewer', detail: { prompt: 'a.txt', error: 'spawn pi ENOENT' } })}\n`,
  )
  world.runner.states.implementer = { state: 'idle' }
  assert.equal((await run(['watch'], world.deps)).stdout, '140 reviewer run failed: spawn pi ENOENT\n')
})
