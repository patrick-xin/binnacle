/**
 * The watch: the Lead's wake-up call.
 *
 * The Lead sends each hand-off by hand, so it needs to know when a change
 * waits. `task watch` reads every task's log from the line the last watch
 * reported or passed, finds the oldest change that the Lead acts on, prints
 * one line for it, and exits. When no line waits, it sleeps two seconds and
 * reads again.
 *
 * The changes that wake the Lead are each change to a state other than
 * `building` and `stopped`. The Lead sets `stopped` itself, so it needs no
 * wake. Each task's place is kept in `tasks/watch.json`; a task that is not
 * there is read from its first line.
 * @module binnacle/scripts/task/watch
 */
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alive, standalone, tasksOf, writeJson } from './state.mjs'

/** The states that wake no one. */
const QUIET = ['building', 'stopped']

/** Counts the watch candidates of this process, so no two of them share one. */
let ticket = 0

/**
 * Watch for the oldest change that waits, and report it. Only one watch
 * runs: each writes its process id to a temporary file and claims the pid
 * file with `linkSync`, which fails when a watch holds it, so two watches
 * that start together cannot both claim it. A watch whose process is gone
 * makes the next watch exit 1 naming the file, and the Lead removes the pid
 * file by hand, as for the lock. A watch removes the pid file only if it
 * took it, also when it gets SIGINT or SIGTERM.
 * @param {{ home: string, now: () => Date, sleep: (ms: number) => Promise<void> }} deps - the world.
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
      const counts = readCounts(tasks)
      const oldest = oldestWaiting(deps.home, counts)
      if (oldest !== undefined) {
        writeJson(join(tasks, 'watch.json'), { ...Object.fromEntries(counts), [oldest.task.n]: oldest.index + 1 })
        say(`${oldest.task.n} ${oldest.line.to} round ${oldest.line.round} (${oldest.line.role})`)
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
 * The oldest line across the tasks that wakes the Lead and that no watch
 * reported. The tasks are read in number order, and only the first line of
 * each can be its oldest, so equal times answer the smaller task.
 * @param {string} home - the home folder.
 * @param {Map<number, number>} counts - for each task, the lines a watch reported or passed.
 * @returns {{ task: object, line: object, index: number } | undefined} the change to report.
 */
function oldestWaiting(home, counts) {
  let oldest
  for (const task of tasksOf(home).values()) {
    const from = counts.get(task.n) ?? 0
    for (let index = from; index < task.lines.length; index++) {
      const line = task.lines[index]
      if (QUIET.includes(line.to)) continue
      if (oldest === undefined || line.at < oldest.line.at) oldest = { task, line, index }
      break
    }
  }
  return oldest
}

/**
 * Read how far each task's log was read.
 * @param {string} tasks - the tasks folder.
 * @returns {Map<number, number>} for each task, the number of lines a watch reported or passed.
 */
function readCounts(tasks) {
  const path = join(tasks, 'watch.json')
  if (!existsSync(path)) return new Map()
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(path, 'utf8'))).map(([n, count]) => [Number(n), count]))
  } catch {
    // A broken count file reads every task from its first line.
    return new Map()
  }
}
