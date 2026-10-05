// A run gets no standard input: when it is not a terminal, pi reads it to its end before it starts (`pi:packages/coding-agent/src/main.ts`).
// Each run leads its own process group, so the time limit also stops its children.
import { spawn as spawnProcess } from 'node:child_process'
import { closeSync, existsSync, linkSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { locked } from '../lock.mjs'
import { alive, appendEvent, writeJson } from '../state.mjs'

export const LIMIT = 45 * 60_000

export const GRACE = 10_000

export const IDLE = 10 * 60_000

export function waiting(dir) {
  const queue = join(dir, 'queue')
  if (!existsSync(queue)) return []
  return readdirSync(queue)
    .filter((name) => name.endsWith('.txt'))
    .toSorted()
}

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

export function supervised(dir) {
  try {
    const owner = readFileSync(join(dir, 'supervisor.pid'), 'utf8').trim()
    return /^\d+$/.test(owner) && alive(Number(owner))
  } catch {
    return false
  }
}

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
