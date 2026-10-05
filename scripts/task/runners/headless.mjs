// Each function runs under the task lock, as each command does.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alive, writeJson } from '../state.mjs'
import { GRACE, supervised, waiting } from './supervise.mjs'
import { toolOf } from './tools.mjs'

const SUPERVISOR = join(dirname(fileURLToPath(import.meta.url)), 'supervise.mjs')

let ticket = 0

export function makeHeadless(deps) {
  const isAlive = deps.alive ?? alive
  const pause = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  // Each caller holds the task lock, so the removal of a stale claim here
  // cannot race another: a supervisor only creates its claim, and removes it
  // under the same lock.
  const wake = (dir) => {
    if (supervised(dir)) return
    rmSync(join(dir, 'supervisor.pid'), { force: true })
    deps.spawnSupervisor(SUPERVISOR, dir)
  }
  return {
    async start(agent) {
      const tool = toolOf(agent.role, { tool: agent.tool })
      const dir = dirname(agent.sessionDir)
      mkdirSync(join(dir, 'queue'), { recursive: true })
      mkdirSync(agent.sessionDir, { recursive: true })
      writeJson(join(dir, 'agent.json'), {
        role: agent.role,
        home: deps.home,
        cwd: agent.cwd,
        env: agent.env,
        file: tool.file,
        args: ['-p', ...tool.args(agent)],
        session: `${agent.n}-${agent.role}`,
      })
      wake(dir)
      return { dir }
    },

    async prompt(handle, text) {
      const name = `${deps.now().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${String(++ticket).padStart(4, '0')}.txt`
      const tmp = join(handle.dir, 'queue', `${name}.tmp`)
      writeFileSync(tmp, text)
      renameSync(tmp, join(handle.dir, 'queue', name))
      wake(handle.dir)
    },

    async activity(handle) {
      const run = readRun(handle.dir)
      if (run !== undefined && alive(run.pid)) return { state: 'working', root: run.pid }
      return { state: 'idle' }
    },

    async close(handle) {
      for (const name of waiting(handle.dir)) rmSync(join(handle.dir, 'queue', name), { force: true })
      const run = readRun(handle.dir)
      const claim = join(handle.dir, 'supervisor.pid')
      const owner = existsSync(claim) ? Number(readFileSync(claim, 'utf8').trim()) : undefined
      const supervisors = [...new Set([run?.supervisor, owner].filter((pid) => pid > 0))]
      if (run?.pid > 0) deps.kill(-run.pid, 'SIGTERM')
      for (const pid of supervisors) deps.kill(pid, 'SIGTERM')
      // The run's whole process group, not its leader alone: a child can
      // outlive the leader. `kill(-pgid, 0)` succeeds while any member lives.
      const living = () => [...(run?.pid > 0 && isAlive(-run.pid) ? [-run.pid] : []), ...supervisors.filter((pid) => isAlive(pid))]
      for (let waited = 0; living().length > 0 && waited < GRACE; waited += 100) await pause(100)
      for (const pid of living()) deps.kill(pid, 'SIGKILL')
      for (let waited = 0; living().length > 0 && waited < GRACE; waited += 100) await pause(100)
      if (living().length > 0) throw new Error(`cannot stop ${living().join(', ')}; check them, then stop the task again`)
    },
  }
}

function readRun(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  } catch {
    return undefined
  }
}
