import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeWorld } from './world.mjs'
import { run } from './task.mjs'

/** Drive a task to `ready` at round 1, one step a minute. */
async function ready(world, n, path) {
  world.setIssue(n, world.shape(path))
  for (const argv of [
    ['start', String(n)],
    ['set', String(n), 'approved', '--as', 'reviewer'],
    ['set', String(n), 'building', '--as', 'implementer'],
    ['set', String(n), 'ready', '--as', 'implementer'],
  ]) {
    world.tick()
    assert.equal((await run(argv, world.deps)).code, 0, `${argv.join(' ')} failed`)
  }
}

test('`task watch` exits with one line for the oldest change that the Lead acts on and that no watch reported', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await ready(world, 140, 'scripts/task/')
  world.tick(30_000)
  await ready(world, 141, 'docs/')

  // Each run takes the oldest change that waits: task 140 first. The Lead's
  // own `spec`, `building`, and `ready`, which goes to the Reviewer, wake no one.
  const reports = ['140 approved round 0 (reviewer)', '141 approved round 0 (reviewer)']
  for (const [i, expected] of reports.entries()) {
    const result = await run(['watch'], world.deps)
    assert.equal(result.code, 0, `run ${i + 1}`)
    assert.equal(result.stdout, `${expected}\n`, `run ${i + 1}`)
  }
  assert.deepEqual(JSON.parse(readFileSync(join(world.home, 'tasks', 'watch.json'), 'utf8')), {
    140: { log: 2, events: 0 },
    141: { log: 2, events: 0 },
  })
})

test('Two changes that wait are reported by two runs of `task watch`, one each', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  world.tick()
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  world.tick()
  await run(['set', '140', 'spec', '--as', 'lead'], world.deps)
  world.tick()
  await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)

  const first = await run(['watch'], world.deps)
  assert.equal(first.stdout, '140 changes round 0 (reviewer)\n')
  const second = await run(['watch'], world.deps)
  assert.equal(second.stdout, '140 approved round 0 (reviewer)\n')
})

test('`task watch` sleeps and reads again when no line waits', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  await ready(world, 140, 'scripts/task/')
  // Drain the one change that waits: `approved` at round 0.
  await run(['watch'], world.deps)

  const reads = []
  const deps = {
    ...world.deps,
    sleep: async () => {
      reads.push('slept')
      writeFileSync(
        join(world.home, 'tasks', '140', 'log.ndjson'),
        '{"at":"2026-10-05T10:04:30.000Z","role":"reviewer","from":"ready","to":"approved","round":1}\n',
        { flag: 'a' },
      )
    },
  }
  const woken = await run(['watch'], deps)
  assert.equal(woken.code, 0)
  assert.equal(woken.stdout, '140 approved round 1 (reviewer)\n')
  assert.deepEqual(reads, ['slept'])
})

test('a second watch exits 2 while one runs', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)

  // The first watch sleeps until the test lets it go, and ends by reporting
  // the change its sleep adds.
  let letGo
  const gate = new Promise((resolve) => {
    letGo = resolve
  })
  t.after(() => letGo())
  const holding = run(['watch'], {
    ...world.deps,
    sleep: async () => {
      writeFileSync(
        join(world.home, 'tasks', '140', 'log.ndjson'),
        '{"at":"2026-10-05T10:01:00.000Z","role":"reviewer","from":"spec","to":"changes","round":0}\n',
        { flag: 'a' },
      )
      await gate
    },
  })
  await new Promise((resolve) => setImmediate(resolve))

  const second = await run(['watch'], world.deps)
  assert.equal(second.code, 2)
  assert.equal(second.stderr, 'a watch runs already\n')
  assert.equal(second.stdout, '')

  // The refusal removes nothing: the running watch keeps its claim, and a
  // third watch sees the claim and refuses too.
  const pidFile = join(world.home, 'tasks', 'watch.pid')
  assert.equal(readFileSync(pidFile, 'utf8'), `${process.pid}`)
  const third = await run(['watch'], world.deps)
  assert.equal(third.code, 2)
  assert.equal(third.stderr, 'a watch runs already\n')

  letGo()
  const first = await holding
  assert.equal(first.code, 0)
  assert.equal(first.stdout, '140 changes round 0 (reviewer)\n')
  assert.equal(existsSync(pidFile), false)
})

test('a watch that finds a gone process in watch.pid changes nothing, and exits 1 naming the file', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  const gone = spawnSync('true')
  const pidFile = join(world.home, 'tasks', 'watch.pid')
  writeFileSync(pidFile, `${gone.pid}`)

  const result = await run(['watch'], world.deps)
  assert.equal(result.code, 1)
  assert.equal(result.stderr, `${pidFile}: its process ${gone.pid} is gone; check it, then remove the file by hand\n`)
  assert.equal(readFileSync(pidFile, 'utf8'), `${gone.pid}`)
  assert.equal(existsSync(join(world.home, 'tasks', 'watch.json')), false)

  // The Lead removes the stale pid file by hand, and the watch runs.
  rmSync(pidFile)
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  const after = await run(['watch'], world.deps)
  assert.equal(after.code, 0)
  assert.equal(after.stdout, '140 changes round 0 (reviewer)\n')
})

test('a watch that holds the pid file releases it when it gets SIGTERM', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  world.setIssue(140, world.shape('scripts/task/'))
  assert.equal((await run(['start', '140'], world.deps)).code, 0)
  const pidFile = join(world.home, 'tasks', 'watch.pid')

  // The watch polls with nothing waiting, holding the pid file.
  let letGo
  const gate = new Promise((resolve) => {
    letGo = resolve
  })
  t.after(() => letGo())
  const holding = run(['watch'], {
    ...world.deps,
    sleep: async () => {
      writeFileSync(
        join(world.home, 'tasks', '140', 'log.ndjson'),
        '{"at":"2026-10-05T10:00:30.000Z","role":"reviewer","from":"spec","to":"changes","round":0}\n',
        { flag: 'a' },
      )
      await gate
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(existsSync(pidFile), true)

  process.emit('SIGTERM')

  assert.equal(existsSync(pidFile), false)
  letGo()
  assert.equal((await holding).code, 0)
})
