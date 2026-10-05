/**
 * The state of a task: the log that governs it, the states that can follow
 * each other, and the files that make two tasks conflict.
 *
 * The log is one JSON line per change of state: `{ "at", "role", "from",
 * "to", "round" }`, with `at` in ISO 8601 UTC. The last line is the current
 * state and round. A log that does not end with a newline, or holds a line
 * that is not JSON, is broken: each command for that task refuses and names
 * the file, and the Lead repairs it by hand.
 *
 * This module also holds the two small routines every command shares: the
 * write that a reader sees whole, and the check that a process id is live.
 * @module binnacle/scripts/task/state
 */
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Whether this process is the task tool's own command line, not a test that
 * loads the module. Only the command line ends itself on a signal, after it
 * has released what it holds; a test stays up.
 */
export const standalone = /scripts[/\\]task[/\\]task\.mjs$/.test(process.argv[1] ?? '')

/** The states a role can set with `task set`, each with the role that owns it. */
export const OWNERS = { spec: 'lead', changes: 'reviewer', approved: 'reviewer', building: 'implementer', ready: 'implementer' }

/**
 * Read a task's log.
 * @param {string} folder - the task's folder.
 * @returns {{ at: string, role: string, from: string | null, to: string, round: number }[]} one entry per change, in order.
 * @throws {Error} when the log is missing or broken; the message names the file.
 */
export function readLog(folder) {
  const path = join(folder, 'log.ndjson')
  if (!existsSync(path)) throw new Error(`${path}: no log to read`)
  const text = readFileSync(path, 'utf8')
  if (text === '') throw new Error(`${path}: no line to read`)
  if (!text.endsWith('\n')) throw new Error(`${path}: the log does not end with a newline`)
  return text
    .split('\n')
    .slice(0, -1)
    .map((line, index) => {
      let entry
      try {
        entry = JSON.parse(line)
      } catch (error) {
        throw new Error(`${path}: line ${index + 1} is not JSON`, { cause: error })
      }
      for (const key of ['at', 'role', 'to', 'round']) {
        if (!(key in entry)) throw new Error(`${path}: line ${index + 1} has no ${key}`)
      }
      return entry
    })
}

/**
 * Read a task's record of what does not change.
 * @param {string} folder - the task's folder.
 * @returns {{ n: number, branch: string, worktree: string, files: string[], createdAt: string }} the record.
 * @throws {Error} when the record is missing or broken; the message names the file.
 */
export function readTask(folder) {
  const path = join(folder, 'task.json')
  if (!existsSync(path)) throw new Error(`${folder}: no task folder`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${path}: not JSON; repair it by hand`, { cause: error })
    throw error
  }
}

/**
 * The states that `task set` can set after a state at a round.
 *
 * `blocked` and `stopped` are set only by `task ask` and `task stop`, so they
 * are not listed: ask follows each state except `blocked` and `stopped`, and
 * stop follows each state except `stopped`.
 * @param {string} from - the current state.
 * @param {number} round - the current round.
 * @returns {string[]} the states that can follow.
 */
export function followers(from, round) {
  switch (from) {
    case 'spec':
      return ['changes', 'approved']
    case 'changes':
      return round === 0 ? ['spec'] : ['building', 'ready']
    case 'approved':
      return round === 0 ? ['building'] : []
    case 'building':
      return ['ready']
    case 'ready':
      return ['changes', 'approved']
    default:
      return []
  }
}

/**
 * Whether two paths of two issues overlap: they are equal, or one is a folder
 * that holds the other. A folder holds each path that starts with it, also a
 * path that does not exist yet.
 * @param {string} one - one path.
 * @param {string} other - the other path.
 * @returns {boolean} whether they overlap.
 */
export function overlap(one, other) {
  return one === other || (one.endsWith('/') && other.startsWith(one)) || (other.endsWith('/') && one.startsWith(other))
}

/**
 * Whether a process id is live, as this process can see it.
 * @param {number} pid - the process id.
 * @returns {boolean} whether the process exists.
 */
export function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/**
 * Write JSON to a temporary file, then rename it over the path, so a reader
 * sees the whole file or the old one.
 * @param {string} path - the path to write.
 * @param {object} value - the value.
 */
export function writeJson(path, value) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value)}\n`)
  renameSync(tmp, path)
}

/**
 * A task of the home folder, as the log and the record hold it.
 * @typedef {{ n: number, folder: string, files: string[], state: string, round: number, lines: object[] }} Task
 */

/**
 * Each task of a home folder, by number, oldest first, and each folder that
 * cannot be read as a task, with the reason. The state and the round are the
 * last line of the log; the files are the record's.
 * @param {string} home - the home folder, which holds `tasks`.
 * @returns {{ tasks: Map<number, Task>, unreadable: { n: number, reason: string }[] }} the tasks, and the folders that are not.
 */
export function readTasks(home) {
  const tasks = new Map()
  const unreadable = []
  const folder = join(home, 'tasks')
  if (!existsSync(folder)) return { tasks, unreadable }
  for (const entry of readdirSync(folder, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && /^\d+$/.test(dirent.name))
    .toSorted((a, b) => Number(a.name) - Number(b.name))) {
    const n = Number(entry.name)
    try {
      const record = readTask(join(folder, entry.name))
      const lines = readLog(join(folder, entry.name))
      const last = lines.at(-1)
      tasks.set(n, { n, folder: join(folder, entry.name), files: record.files, state: last.to, round: last.round, lines })
    } catch (error) {
      unreadable.push({ n, reason: error.message })
    }
  }
  return { tasks, unreadable }
}

/**
 * Each task of a home folder, by number, oldest first.
 * @param {string} home - the home folder, which holds `tasks`.
 * @returns {Map<number, Task>} each task, by its number.
 * @throws {Error} when a task's log or record is broken; the message names the file.
 */
export function tasksOf(home) {
  const { tasks, unreadable } = readTasks(home)
  if (unreadable.length > 0) throw new Error(unreadable[0].reason)
  return tasks
}

/**
 * Read a task's agents: for each role the task tool started, how to reach it.
 * @param {string} folder - the task's folder.
 * @returns {Record<string, { role: string, runner: string, tool: string, model: string, thinking?: string, handle: object, startedAt: string }>} each agent, by role.
 * @throws {Error} when the file is broken; the message names it.
 */
export function readAgents(folder) {
  const path = join(folder, 'agents.json')
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${path}: not JSON; repair it by hand`, { cause: error })
  }
}

/**
 * An event of a task: what is not a change of state, such as a hand-off, a
 * try that is tried again, or a stall.
 * @typedef {{ at: string, event: string, role: string, detail?: object }} Event
 */

/**
 * Read a task's events log, `events.ndjson`. A task with no events has none.
 * @param {string} folder - the task's folder.
 * @returns {Event[]} each event, in order.
 * @throws {Error} when the log is broken; the message names the file.
 */
export function readEvents(folder) {
  const path = join(folder, 'events.ndjson')
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  if (text === '') return []
  if (!text.endsWith('\n')) throw new Error(`${path}: the log does not end with a newline`)
  return text
    .split('\n')
    .slice(0, -1)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${path}: line ${index + 1} is not JSON`, { cause: error })
      }
    })
}

/**
 * Add one event to a task's events log.
 * @param {string} folder - the task's folder.
 * @param {Event} event - the event.
 */
export function appendEvent(folder, event) {
  writeFileSync(join(folder, 'events.ndjson'), `${JSON.stringify(event)}\n`, { flag: 'a' })
}
