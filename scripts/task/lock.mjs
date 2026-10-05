/**
 * The lock: one command writes at a time.
 *
 * The task commands and the supervisor of a headless run share it, so a
 * prompt that comes as a supervisor exits starts a new supervisor.
 * @module binnacle/scripts/task/lock
 */
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alive, standalone } from './state.mjs'

/** Counts the lock candidates of this process, so no two of its commands share one. */
let ticket = 0

/**
 * Run `body` as the one command that writes. The lock is a file that holds its
 * owner's process id: the pid is written to a temporary file and published with
 * `linkSync`, which fails when the lock exists, so a lock never appears without
 * its owner. A command that finds a lock waits for it while its process lives;
 * a lock whose process is gone makes it exit 1 naming the lock and the pid, and
 * the Lead removes the lock by hand, because a check of the owner and a
 * removal are two steps that another process can come between. A command
 * removes only the lock it holds, also when it gets SIGINT or SIGTERM.
 * @param {{ home: string, sleep: (ms: number) => Promise<void> }} deps - the home and the sleep.
 * @param {() => Promise<number> | number} body - the writing, answering the exit code.
 * @returns {Promise<number>} the exit code.
 */
export async function locked(deps, body) {
  const tasks = join(deps.home, 'tasks')
  mkdirSync(tasks, { recursive: true })
  const lock = join(tasks, '.lock')
  const waiting = join(tasks, `.lock.${process.pid}.${++ticket}.tmp`)
  writeFileSync(waiting, String(process.pid))
  let holding = false
  const release = () => {
    try {
      if (readFileSync(lock, 'utf8').trim() === String(process.pid)) rmSync(lock)
    } catch {
      // Not ours, or already gone: leave it.
    }
  }
  const leave = (code) => () => {
    if (holding) release()
    if (standalone) process.exit(code)
  }
  const interrupt = leave(130)
  const terminate = leave(143)
  try {
    while (true) {
      try {
        linkSync(waiting, lock)
        holding = true
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      let owner
      try {
        owner = readFileSync(lock, 'utf8').trim()
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      if (!/^\d+$/.test(owner) || !alive(Number(owner)))
        throw new Error(`${lock}: its process ${owner} is gone; check it, then remove the lock by hand`)
      await deps.sleep(20)
    }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    return await body()
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    rmSync(waiting, { force: true })
    if (holding) release()
  }
}
