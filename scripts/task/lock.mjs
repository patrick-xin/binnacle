// A supervisor takes the lock too, so a prompt that arrives as a supervisor exits starts a new supervisor.
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alive, standalone } from './state.mjs'

let ticket = 0

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
