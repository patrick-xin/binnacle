/**
 * The watch: the Lead's wake-up call.
 *
 * `task watch` reads each task's log and events log from the line the last
 * watch reported or passed, finds the oldest entry that the Lead acts on,
 * prints one line for it, and exits. When no entry waits, it sleeps two
 * seconds and reads again.
 *
 * Before each read, it looks at each agent of each running task, and writes
 * to the events log what the Lead must hear of: a stall, an agent that waits
 * in its pane, a runner that fails, and a hand-off that no command sent.
 * Each task's place in each log is kept in `tasks/watch.json`; a task that is
 * not there is read from its first line.
 * @module binnacle/scripts/task/watch
 */
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alive, appendEvent, readAgents, readEvents, readTasks, standalone, writeJson } from './state.mjs'

/** An agent that works with no session record for this long has stalled. */
export const QUIET = 20 * 60_000

/** The time over which a busy process is measured. */
export const WINDOW = 5 * 60_000

/** The CPU seconds in `WINDOW` that make a process busy: four minutes of five. */
export const BUSY = 240

/** The time between two CPU samples, at most. */
const SAMPLE = 30_000

/** The events that wake the Lead. */
const WAKING = ['handoff-failed', 'not-sent', 'stalled', 'timed-out', 'run-failed', 'waits', 'runner-error']

/** Counts the watch candidates of this process, so no two of them share one. */
let ticket = 0

/**
 * Whether a change of state wakes the Lead: one that the Lead must act on,
 * and that the Lead did not set itself.
 * @param {{ role: string, to: string, round: number }} line - the change.
 * @returns {boolean} whether it wakes the Lead.
 */
export function wakes(line) {
  if (line.role === 'lead') return false
  return line.to === 'blocked' || line.to === 'approved' || (line.to === 'changes' && line.round === 0)
}

/**
 * The time of an agent's last session record: the change time of the newest
 * session file, or of its last prompt if it has no file yet, or of its start.
 * @param {string} folder - the task's folder.
 * @param {{ role: string, startedAt: string }} agent - the agent.
 * @param {{ at: string, event: string, role: string }[]} events - the task's events.
 * @returns {Date} the time.
 */
export function lastRecord(folder, agent, events) {
  const sessions = join(folder, 'agents', agent.role, 'sessions')
  if (existsSync(sessions)) {
    const times = readdirSync(sessions)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => statSync(join(sessions, name)).mtimeMs)
    if (times.length > 0) return new Date(Math.max(...times))
  }
  const prompted = events.findLast((event) => event.event === 'prompted' && event.role === agent.role)
  return new Date(prompted?.at ?? agent.startedAt)
}

/**
 * Watch for the oldest entry that waits, and report it. Only one watch runs:
 * each claims `watch.pid` with `linkSync`, which fails when a watch holds it.
 * A watch whose process is gone makes the next watch exit 1 naming the file,
 * and the Lead removes it by hand, as for the lock. A watch removes the pid
 * file only if it took it, also when it gets SIGINT or SIGTERM.
 * @param {object} deps - the world.
 * @param {(line: string) => void} say - prints a line of stdout.
 * @returns {Promise<number>} the exit code.
 * @throws {WatchTaken} when a watch runs already.
 */
export async function watch(deps, say) {
  const tasks = join(deps.home, 'tasks')
  mkdirSync(tasks, { recursive: true })
  const pid = join(tasks, 'watch.pid')
  const waiting = join(tasks, `watch.pid.${process.pid}.${++ticket}.tmp`)
  writeFileSync(waiting, String(process.pid))
  let took = false
  const release = () => {
    try {
      if (readFileSync(pid, 'utf8').trim() === String(process.pid)) rmSync(pid)
    } catch {
      // Not ours, or already gone: leave it.
    }
  }
  const leave = (code) => () => {
    if (took) release()
    if (standalone) process.exit(code)
  }
  const interrupt = leave(130)
  const terminate = leave(143)
  try {
    while (true) {
      try {
        linkSync(waiting, pid)
        took = true
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      let owner
      try {
        owner = readFileSync(pid, 'utf8').trim()
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      if (/^\d+$/.test(owner) && alive(Number(owner))) throw new WatchTaken()
      throw new Error(`${pid}: its process ${owner} is gone; check it, then remove the file by hand`)
    }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    while (true) {
      await look(deps)
      const counts = readCounts(tasks)
      const oldest = oldestWaiting(deps.home, counts)
      if (oldest !== undefined) {
        const place = { ...(counts.get(oldest.n) ?? { log: 0, events: 0 }), [oldest.file]: oldest.index + 1 }
        writeJson(join(tasks, 'watch.json'), { ...Object.fromEntries(counts), [oldest.n]: place })
        say(oldest.text)
        return 0
      }
      await deps.sleep(2000)
    }
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    rmSync(waiting, { force: true })
    if (took) release()
  }
}

/** A refusal that carries its own exit code: 2, as a watch that cannot start. */
export class WatchTaken extends Error {
  constructor() {
    super('a watch runs already')
    this.exitCode = 2
  }
}

/**
 * Look at each agent of each running task, and write to its events log what
 * the Lead must hear of. Each is written once.
 * @param {object} deps - the world.
 * @returns {Promise<void>}
 */
async function look(deps) {
  const { tasks } = readTasks(deps.home)
  let table
  for (const task of tasks.values()) {
    if (task.state === 'stopped') continue
    let events
    let agents
    try {
      events = readEvents(task.folder)
      agents = Object.values(readAgents(task.folder))
    } catch {
      // `task status` names a task that cannot be read; the watch reads the others.
      continue
    }
    const event = (name, role, detail) => appendEvent(task.folder, { at: deps.now().toISOString(), event: name, role, detail })
    notSent(events, deps, event)
    for (const agent of agents) {
      const since = events.findLastIndex((e) => e.role === agent.role && ['started', 'prompted'].includes(e.event))
      const after = events.slice(since + 1).filter((e) => e.role === agent.role)
      let activity
      try {
        activity = await deps.runners[agent.runner].activity(agent.handle)
      } catch (error) {
        if (!after.some((e) => e.event === 'runner-error')) event('runner-error', agent.role, { error: error.message })
        continue
      }
      if (activity.state === 'blocked') {
        if (!after.some((e) => e.event === 'waits')) event('waits', agent.role)
        continue
      }
      if (activity.state !== 'working') continue
      table ??= deps.processes === undefined ? [] : await deps.processes()
      const busy = busyUnder(task.folder, agent.role, activity.root, table, deps.now())
      const record = lastRecord(task.folder, agent, events)
      const quiet = deps.now().getTime() - record.getTime()
      if (quiet < QUIET && busy.length === 0) continue
      if (events.some((e) => e.event === 'stalled' && e.role === agent.role && e.detail?.record === record.toISOString())) continue
      const line = [
        `${task.n} ${agent.role} stalled: no session record for ${Math.floor(quiet / 60_000)} min`,
        ...busy.map((process) => `busy ${process.pid} ${process.command}, cpu ${clock(process.cpu)} in ${WINDOW / 60_000} min`),
      ].join('; ')
      event('stalled', agent.role, { record: record.toISOString(), line })
    }
  }
}

/**
 * Write `not-sent` for each hand-off that no command finished: it has no
 * `prompted` and no `handoff-failed`, and no process holds the lock.
 * @param {object[]} events - the task's events.
 * @param {{ home: string }} deps - the world.
 * @param {(name: string, role: string, detail: object) => void} event - writes an event.
 */
function notSent(events, deps, event) {
  if (lockHeld(deps.home)) return
  const ended = new Set(events.filter((e) => ['prompted', 'handoff-failed', 'not-sent'].includes(e.event)).map((e) => e.detail.id))
  for (const handoff of events.filter((e) => e.event === 'handoff' && !ended.has(e.detail.id)))
    event('not-sent', handoff.role, { id: handoff.detail.id })
}

/**
 * Whether a live process holds the lock.
 * @param {string} home - the home folder.
 * @returns {boolean} whether it is held.
 */
function lockHeld(home) {
  try {
    const owner = readFileSync(join(home, 'tasks', '.lock'), 'utf8').trim()
    return /^\d+$/.test(owner) && alive(Number(owner))
  } catch {
    return false
  }
}

/**
 * Sample the CPU time of each process under a root, at any depth, and answer
 * those that used at least `BUSY` seconds in the last `WINDOW`. The samples
 * are kept in the agent's `cpu.json` across watches; with less than `WINDOW`
 * of samples, no process is busy.
 * @param {string} folder - the task's folder.
 * @param {string} role - the agent's role.
 * @param {number | undefined} root - the process to look under.
 * @param {{ pid: number, ppid: number, command: string, cpuSeconds: number }[]} table - the processes.
 * @param {Date} now - the time.
 * @returns {{ pid: number, command: string, cpu: number }[]} the busy processes.
 */
function busyUnder(folder, role, root, table, now) {
  if (root === undefined) return []
  const under = new Map()
  const children = Map.groupBy(table, (process) => process.ppid)
  const stack = [root]
  while (stack.length > 0) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (under.has(child.pid)) continue
      under.set(child.pid, child)
      stack.push(child.pid)
    }
  }
  const path = join(folder, 'agents', role, 'cpu.json')
  let samples = []
  try {
    samples = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // No samples yet.
  }
  const at = now.getTime()
  if (samples.length === 0 || at - samples.at(-1).at >= SAMPLE)
    samples.push({ at, cpu: Object.fromEntries([...under.values()].map((process) => [process.pid, process.cpuSeconds])) })
  samples = samples.filter((sample) => at - sample.at <= WINDOW + 60_000)
  mkdirSync(join(folder, 'agents', role), { recursive: true })
  writeJson(path, samples)
  const before = samples.findLast((sample) => at - sample.at >= WINDOW)
  if (before === undefined) return []
  const busy = []
  for (const process of under.values()) {
    const then = before.cpu[process.pid]
    if (then === undefined) continue
    const cpu = process.cpuSeconds - then
    if (cpu >= BUSY) busy.push({ pid: process.pid, command: process.command, cpu })
  }
  return busy
}

/**
 * Seconds as `m:ss`.
 * @param {number} seconds - the seconds.
 * @returns {string} the time.
 */
function clock(seconds) {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * The line of an event that wakes the Lead.
 * @param {number} n - the task number.
 * @param {{ event: string, role: string, detail?: object }} event - the event.
 * @returns {string} the line.
 */
function eventLine(n, event) {
  switch (event.event) {
    case 'handoff-failed':
      return `${n} ${event.role} hand-off ${event.detail.id} failed: ${event.detail.error}`
    case 'not-sent':
      return `${n} ${event.role} hand-off ${event.detail.id} was not sent; run task resend ${n}`
    case 'stalled':
      return event.detail.line
    case 'timed-out':
      return `${n} ${event.role} run timed out after ${event.detail.minutes} min`
    case 'run-failed':
      return `${n} ${event.role} run failed: ${event.detail.error}`
    case 'waits':
      return `${n} ${event.role} waits in its pane`
    default:
      return `${n} ${event.role} runner error: ${event.detail.error}`
  }
}

/**
 * The oldest entry across the tasks, in the log or the events log, that
 * wakes the Lead and that no watch reported. Equal times answer the smaller
 * task, and the log before the events log.
 * @param {string} home - the home folder.
 * @param {Map<number, { log: number, events: number }>} counts - for each task, the entries a watch reported or passed.
 * @returns {{ n: number, file: 'log' | 'events', index: number, at: string, text: string } | undefined} the entry to report.
 */
function oldestWaiting(home, counts) {
  let oldest
  const offer = (entry) => {
    if (oldest === undefined || entry.at < oldest.at) oldest = entry
  }
  for (const task of readTasks(home).tasks.values()) {
    const place = counts.get(task.n) ?? { log: 0, events: 0 }
    for (let index = place.log; index < task.lines.length; index++) {
      const line = task.lines[index]
      if (!wakes(line)) continue
      offer({ n: task.n, file: 'log', index, at: line.at, text: `${task.n} ${line.to} round ${line.round} (${line.role})` })
      break
    }
    let events
    try {
      events = readEvents(task.folder)
    } catch {
      continue
    }
    for (let index = place.events; index < events.length; index++) {
      const event = events[index]
      if (!WAKING.includes(event.event)) continue
      offer({ n: task.n, file: 'events', index, at: event.at, text: eventLine(task.n, event) })
      break
    }
  }
  return oldest
}

/**
 * Read how far each task's logs were read. A count from before the events
 * log is the log's count.
 * @param {string} tasks - the tasks folder.
 * @returns {Map<number, { log: number, events: number }>} for each task, the entries a watch reported or passed.
 */
function readCounts(tasks) {
  const path = join(tasks, 'watch.json')
  if (!existsSync(path)) return new Map()
  try {
    return new Map(
      Object.entries(JSON.parse(readFileSync(path, 'utf8'))).map(([n, count]) => [
        Number(n),
        typeof count === 'number' ? { log: count, events: 0 } : count,
      ]),
    )
  } catch {
    // A broken count file reads every task from its first line.
    return new Map()
  }
}
