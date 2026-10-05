/**
 * The supervisor of a headless agent: it owns the agent's runs after the
 * command that queued them exits.
 *
 * The agent's folder, `tasks/<n>/agents/<role>/`, holds `agent.json` (how to
 * run the tool), `queue/` (the prompts that wait, oldest first), `run.json`
 * (the run in progress) and `out.log`. The supervisor runs each prompt as one
 * process, with no standard input, because pi reads standard input to its
 * end before it starts when it is not a terminal
 * (`pi:packages/coding-agent/src/main.ts`), so an open input stops it forever.
 * Each run is the leader of its own process group, so the time limit stops
 * its children too.
 * @module binnacle/scripts/task/runners/supervise
 */
import { spawn as spawnProcess } from 'node:child_process'
import { closeSync, existsSync, linkSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { locked } from '../lock.mjs'
import { alive, appendEvent, writeJson } from '../state.mjs'

/** The time limit of a run: 45 minutes. */
export const LIMIT = 45 * 60_000

/** The time between `SIGTERM` and `SIGKILL` when a run is stopped. */
export const GRACE = 10_000

/** The time the supervisor waits with an empty queue before it exits. */
export const IDLE = 10 * 60_000

/**
 * A run: its process id, a promise of its exit code, and the error when the
 * tool could not start (then the code is -1, and the pid may be undefined).
 * @typedef {{ pid?: number, exited: Promise<number>, error?: string }} Child
 * @typedef {{
 *   spawn: (file: string, args: string[], options: { cwd: string, env: Record<string, string>, out: string }) => Child,
 *   kill: (pid: number, signal: string) => void,
 *   timer: (ms: number) => Promise<void>,
 *   now: () => Date,
 *   sleep: (ms: number) => Promise<void>,
 * }} SuperviseDeps
 */

/**
 * The prompts that wait in a queue, oldest first.
 * @param {string} dir - the agent's folder.
 * @returns {string[]} the file names in `queue/`.
 */
export function waiting(dir) {
  const queue = join(dir, 'queue')
  if (!existsSync(queue)) return []
  return readdirSync(queue)
    .filter((name) => name.endsWith('.txt'))
    .toSorted()
}

/**
 * Supervise one headless agent until its queue has been empty for `IDLE`.
 * Only one supervisor runs for an agent: it claims `supervisor.pid` the way a
 * command takes the lock, under the task lock, and a second supervisor exits
 * at once.
 * @param {string} dir - the agent's folder.
 * @param {SuperviseDeps} deps - the world.
 * @returns {Promise<void>}
 */
export async function supervise(dir, deps) {
  const agent = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'))
  const folder = dirname(dirname(dir))
  const claim = join(dir, 'supervisor.pid')
  const candidate = join(dir, `supervisor.pid.${process.pid}.tmp`)
  writeFileSync(candidate, String(process.pid))
  // Under the task lock, as a wake removes a stale claim: so a wake never
  // removes a claim that was made after it looked.
  const claimed = await locked({ home: agent.home, sleep: deps.sleep }, () => {
    try {
      linkSync(candidate, claim)
      return true
    } catch (error) {
      if (error.code === 'EEXIST') return false
      throw error
    } finally {
      rmSync(candidate, { force: true })
    }
  })
  if (!claimed) return
  const event = (name, detail) => appendEvent(folder, { at: deps.now().toISOString(), event: name, role: agent.role, detail })
  let idleSince = deps.now()
  while (true) {
    const [next] = waiting(dir)
    if (next === undefined) {
      if (deps.now().getTime() - idleSince.getTime() >= IDLE) {
        // Under the lock, so a prompt that comes now sees no supervisor and
        // starts a new one.
        const done = await locked({ home: agent.home, sleep: deps.sleep }, () => {
          if (waiting(dir).length > 0) return false
          rmSync(claim, { force: true })
          return true
        })
        if (done) return
      }
      await deps.sleep(1000)
      continue
    }
    const path = join(dir, 'queue', next)
    const text = readFileSync(path, 'utf8')
    let child
    try {
      child = deps.spawn(agent.file, [...agent.args, '--session-id', agent.session, text], {
        cwd: agent.cwd,
        env: agent.env,
        out: join(dir, 'out.log'),
      })
    } catch (error) {
      child = { pid: undefined, exited: Promise.resolve(-1), error: error.message }
    }
    writeJson(join(dir, 'run.json'), { supervisor: process.pid, pid: child.pid, prompt: next, startedAt: deps.now().toISOString() })
    const ended = await Promise.race([child.exited.then((code) => ({ code })), deps.timer(LIMIT).then(() => undefined)])
    if (ended === undefined) {
      deps.kill(-child.pid, 'SIGTERM')
      const stopped = await Promise.race([child.exited.then(() => true), deps.timer(GRACE).then(() => false)])
      if (!stopped) deps.kill(-child.pid, 'SIGKILL')
      await child.exited
      event('timed-out', { prompt: next, minutes: LIMIT / 60_000 })
    } else if (child.error !== undefined) event('run-failed', { prompt: next, error: child.error })
    else event('run-ended', { prompt: next, code: ended.code })
    rmSync(path, { force: true })
    rmSync(join(dir, 'run.json'), { force: true })
    idleSince = deps.now()
  }
}

/**
 * Whether a supervisor lives for an agent.
 * @param {string} dir - the agent's folder.
 * @returns {boolean} whether `supervisor.pid` names a live process.
 */
export function supervised(dir) {
  try {
    const owner = readFileSync(join(dir, 'supervisor.pid'), 'utf8').trim()
    return /^\d+$/.test(owner) && alive(Number(owner))
  } catch {
    return false
  }
}

/**
 * The deps of a real supervisor. `spawn` gives each run no standard input,
 * and makes it the leader of its own process group.
 * @param {(pid: number) => void} [onSpawn] - told the process id of each run.
 * @returns {SuperviseDeps} the deps.
 */
export function systemDeps(onSpawn = () => {}) {
  return {
    spawn(file, args, options) {
      const out = openSync(options.out, 'a')
      const child = spawnProcess(file, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', out, out],
        detached: true,
      })
      closeSync(out)
      const run = { pid: child.pid, error: undefined }
      // A tool that cannot start emits `error`, and no `exit`.
      run.exited = new Promise((resolve) => {
        child.on('exit', (code, signal) => resolve(code ?? 128 + (signal === 'SIGKILL' ? 9 : 15)))
        child.on('error', (error) => {
          run.error = error.message
          resolve(-1)
        })
      })
      if (child.pid !== undefined) onSpawn(child.pid)
      return run
    },
    kill(pid, signal) {
      try {
        process.kill(pid, signal)
      } catch {
        // Gone already.
      }
    },
    timer: (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref()),
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2]
  let current
  const deps = systemDeps((pid) => (current = pid))
  // Stopped from outside, the supervisor stops its run, then lets its claim go.
  const leave = () => {
    if (current !== undefined) deps.kill(-current, 'SIGTERM')
    setTimeout(() => {
      if (current !== undefined) deps.kill(-current, 'SIGKILL')
      try {
        if (readFileSync(join(dir, 'supervisor.pid'), 'utf8').trim() === String(process.pid)) rmSync(join(dir, 'supervisor.pid'))
      } catch {
        // Gone already.
      }
      process.exit(143)
    }, GRACE)
  }
  process.on('SIGTERM', leave)
  process.on('SIGINT', leave)
  await supervise(dir, deps)
}
