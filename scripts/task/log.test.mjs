import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeWorld } from './world.mjs'
import { run } from './task.mjs'

/** The path of a task's log. */
function logOf(world, n) {
  return join(world.home, 'tasks', String(n), 'log.ndjson')
}

/** The lines of a task's log. */
function lines(world, n) {
  return readFileSync(join(world.home, 'tasks', String(n), 'log.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

/** Start a task in the world. */
async function started(world, n, path) {
  world.setIssue(n, world.shape(path))
  return run(['start', String(n)], world.deps)
}

test('a log that does not end with a newline, or holds a line that is not JSON, makes each command for that task refuse and name the file', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 140, 'scripts/task/')).code, 0)

  const log = logOf(world, 140)
  const whole = readFileSync(log, 'utf8')
  writeFileSync(log, whole.trimEnd())
  const cut = await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  assert.equal(cut.code, 1)
  assert.equal(cut.stderr, `${log}: the log does not end with a newline\n`)
  assert.equal((await run(['status', '140'], world.deps)).code, 1)
  assert.equal((await run(['status'], world.deps)).code, 1)

  writeFileSync(log, `${whole}not json\n`)
  const broken = await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  assert.equal(broken.code, 1)
  assert.equal(broken.stderr, `${log}: line 2 is not JSON\n`)
})

test('a command that finds a lock of a gone process removes nothing, and exits 1 naming the lock and the process id', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 140, 'scripts/task/')).code, 0)
  const lock = join(world.home, 'tasks', '.lock')
  const gone = spawnSync('true')
  writeFileSync(lock, `${gone.pid}`)

  const result = await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  assert.equal(result.code, 1)
  assert.equal(result.stderr, `${lock}: its process ${gone.pid} is gone; check it, then remove the lock by hand\n`)
  assert.equal(readFileSync(lock, 'utf8'), `${gone.pid}`)
  assert.deepEqual(lines(world, 140).at(-1), { at: '2026-10-05T10:00:00.000Z', role: 'lead', from: null, to: 'spec', round: 0 })

  // The Lead removes the stale lock by hand, and the command runs.
  rmSync(lock)
  const after = await run(['set', '140', 'approved', '--as', 'reviewer'], world.deps)
  assert.equal(after.code, 0)
})

test('a start whose git step fails removes what it made, and exits with the error', async (t) => {
  const world = makeWorld()
  world.setIssue(140, world.shape('scripts/task/'))
  const worktrees = join(world.home, 'worktrees')
  mkdirSync(worktrees)
  chmodSync(worktrees, 0o555)
  t.after(() => {
    chmodSync(worktrees, 0o755)
    world.remove()
  })

  const failed = await run(['start', '140'], world.deps)

  assert.equal(failed.code, 1)
  assert.match(failed.stderr, /git worktree add .* failed:/)
  assert.equal(existsSync(join(world.home, 'tasks', '140')), false)
  const branch = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'task/140'], { cwd: world.repo })
  assert.notEqual(branch.status, 0)
  assert.equal(existsSync(join(worktrees, '140')), false)
})

test('a command that holds the lock releases it when it gets SIGINT', async (t) => {
  const world = makeWorld()
  t.after(() => world.remove())
  assert.equal((await started(world, 140, 'scripts/task/')).code, 0)
  await run(['set', '140', 'changes', '--as', 'reviewer'], world.deps)
  const lock = join(world.home, 'tasks', '.lock')

  // The command parks inside its own writing, holding the lock.
  let letGo
  const gate = new Promise((resolve) => {
    letGo = resolve
  })
  t.after(() => letGo())
  const parked = run(['set', '140', 'spec'], {
    ...world.deps,
    readIssue: async () => {
      await gate
      return world.shape('scripts/task/')
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(existsSync(lock), true)

  process.emit('SIGINT')

  assert.equal(existsSync(lock), false)
  letGo()
  assert.equal((await parked).code, 0)
})
