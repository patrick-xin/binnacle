import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GRACE, IDLE, LIMIT, supervise, systemDeps } from './supervise.mjs'

/**
 * An agent's folder with prompts in its queue, and the deps of a supervisor
 * whose clock moves only when it sleeps. `child` makes each run.
 */
function world(t, prompts, child) {
  const home = mkdtempSync(join(tmpdir(), 'binnacle-supervise-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const folder = join(home, 'tasks', '140')
  const dir = join(folder, 'agents', 'reviewer')
  mkdirSync(join(dir, 'queue'), { recursive: true })
  writeFileSync(
    join(dir, 'agent.json'),
    JSON.stringify({
      role: 'reviewer',
      home,
      cwd: '/w',
      env: { BINNACLE_ROLE: 'reviewer' },
      file: 'pi',
      args: ['-p', '--model', 'm'],
      session: '140-reviewer',
    }),
  )
  for (const [i, text] of prompts.entries()) writeFileSync(join(dir, 'queue', `${i}.txt`), text)
  let clock = new Date('2026-10-05T10:00:00.000Z').getTime()
  const spawned = []
  const killed = []
  const deps = {
    spawn(file, args, options) {
      spawned.push({ command: [file, ...args].join(' '), cwd: options.cwd, env: options.env })
      return child(spawned.length, killed)
    },
    kill: (pid, signal) => killed.push(`${pid} ${signal}`),
    timer: () => new Promise(() => {}),
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms
    },
  }
  const events = () =>
    existsSync(join(folder, 'events.ndjson'))
      ? readFileSync(join(folder, 'events.ndjson'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
  return { home, dir, deps, spawned, killed, events }
}

test('the supervisor runs each prompt of the queue in order, as one run of pi in print mode', async (t) => {
  const { dir, deps, spawned, events } = world(t, ['round 1', 'round 2'], (k) => ({ pid: 9000 + k, exited: Promise.resolve(k - 1) }))
  await supervise(dir, deps)
  assert.deepEqual(
    spawned.map((run) => run.command),
    ['pi -p --model m --session-id 140-reviewer round 1', 'pi -p --model m --session-id 140-reviewer round 2'],
  )
  assert.deepEqual(spawned[0].env, { BINNACLE_ROLE: 'reviewer' })
  assert.deepEqual(
    events().map((event) => `${event.event} ${event.detail.prompt} ${event.detail.code}`),
    ['run-ended 0.txt 0', 'run-ended 1.txt 1'],
  )
  assert.deepEqual(readdirSync(join(dir, 'queue')), [])
  assert.equal(existsSync(join(dir, 'run.json')), false)
})

test('the supervisor exits when its queue has been empty for ten minutes, and lets its claim go', async (t) => {
  const { dir, deps } = world(t, [], () => assert.fail('no run'))
  const started = deps.now().getTime()
  await supervise(dir, deps)
  assert.ok(deps.now().getTime() - started >= IDLE)
  assert.equal(existsSync(join(dir, 'supervisor.pid')), false)
})

test('a second supervisor of one agent exits at once', async (t) => {
  const { dir, deps, spawned } = world(t, ['round 1'], () => assert.fail('no run'))
  writeFileSync(join(dir, 'supervisor.pid'), String(process.pid))
  await supervise(dir, deps)
  assert.deepEqual(spawned, [])
  assert.equal(readFileSync(join(dir, 'supervisor.pid'), 'utf8'), String(process.pid))
})

test('a headless run that lasts longer than its time limit is stopped with its child processes, and the watch can report it', async (t) => {
  const timers = []
  const { dir, deps, killed, events } = world(t, ['round 1'], (k, kills) => {
    let end
    const exited = new Promise((resolve) => (end = resolve))
    // This run ignores SIGTERM, and ends on SIGKILL.
    const watchKills = setInterval(() => {
      if (kills.includes(`-${9000 + k} SIGKILL`)) {
        clearInterval(watchKills)
        end(137)
      }
    }, 1)
    return { pid: 9000 + k, exited }
  })
  deps.timer = (ms) => {
    timers.push(ms)
    return Promise.resolve()
  }
  await supervise(dir, deps)
  assert.deepEqual(timers, [LIMIT, GRACE])
  assert.deepEqual(killed, ['-9001 SIGTERM', '-9001 SIGKILL'])
  assert.deepEqual(
    events().map((event) => event.event),
    ['timed-out'],
  )
})

test('a headless run gets no standard input, so a tool that reads it to its end does not wait', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'binnacle-stdin-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const out = join(dir, 'out.log')
  // Like pi's print mode: read standard input to its end, then answer.
  const reader = "let s='';process.stdin.on('data',(d)=>s+=d);process.stdin.on('end',()=>{console.log('read '+s.length);process.exit(0)})"
  const run = systemDeps().spawn(process.execPath, ['-e', reader], { cwd: dir, env: {}, out })
  // A run that waits for its input must not outlive the test.
  t.after(() => {
    try {
      process.kill(-run.pid, 'SIGKILL')
    } catch {
      // Ended already.
    }
  })
  const ended = await Promise.race([run.exited, new Promise((resolve) => setTimeout(() => resolve('waits'), 5000).unref())])
  assert.equal(ended, 0)
  assert.equal(readFileSync(out, 'utf8'), 'read 0\n')
})

test('a supervisor takes its claim under the task lock, so a wake that holds the lock never removes a claim made since it looked', async (t) => {
  const { home, dir, deps, spawned } = world(t, ['round 1'], (k) => ({ pid: 9000 + k, exited: Promise.resolve(0) }))
  // A command holds the lock, as a wake does.
  const lock = join(home, 'tasks', '.lock')
  writeFileSync(lock, String(process.pid))
  const sleep = deps.sleep
  let slept = 0
  let claimedWhileLocked
  deps.sleep = async (ms) => {
    slept += 1
    if (slept === 3) {
      claimedWhileLocked = existsSync(join(dir, 'supervisor.pid'))
      rmSync(lock)
    }
    await sleep(ms)
  }
  await supervise(dir, deps)
  assert.equal(claimedWhileLocked, false)
  assert.equal(spawned.length, 1)
})

test('a run whose tool cannot start ends with its error, and the supervisor records `run-failed` and goes on', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'binnacle-missing-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const missing = systemDeps().spawn(join(dir, 'no-such-tool'), [], { cwd: dir, env: {}, out: join(dir, 'out.log') })
  assert.equal(await missing.exited, -1)
  assert.match(missing.error, /ENOENT/)

  const {
    dir: agent,
    deps,
    spawned,
    events,
  } = world(t, ['round 1', 'round 2'], (k) =>
    k === 1 ? { pid: undefined, exited: Promise.resolve(-1), error: 'spawn pi ENOENT' } : { pid: 9002, exited: Promise.resolve(0) },
  )
  await supervise(agent, deps)
  assert.equal(spawned.length, 2)
  assert.deepEqual(
    events().map((event) => `${event.event} ${event.detail.prompt} ${event.detail.error ?? event.detail.code}`),
    ['run-failed 0.txt spawn pi ENOENT', 'run-ended 1.txt 0'],
  )
  assert.deepEqual(readdirSync(join(agent, 'queue')), [])
})
