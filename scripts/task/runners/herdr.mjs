// herdr answers each command with JSON: { result } or { error: { code, message } }.
import { toolOf } from './tools.mjs'

const RETRY = ['agent_prompt_stalled', 'timeout']

const TRIES = 3

async function herdr(exec, args) {
  const done = await exec('herdr', args)
  let answer
  for (const text of [done.stdout, done.stderr]) {
    try {
      answer = JSON.parse(text)
      break
    } catch {
      // Not JSON: try the other stream.
    }
  }
  if (answer?.error !== undefined) {
    const error = new Error(`herdr ${args[0]} ${args[1]}: ${answer.error.code}: ${answer.error.message ?? ''}`.trim())
    error.herdr = answer.error.code
    throw error
  }
  if (done.code !== 0 || answer?.result === undefined)
    throw new Error(`herdr ${args[0]} ${args[1]} failed: ${(done.stderr || done.stdout).trim()}`)
  return answer.result
}

export function makeHerdr({ exec }) {
  return {
    async start(agent) {
      const tool = toolOf(agent.role, { tool: agent.tool })
      // herdr wants a name that starts with a lowercase letter.
      const name = `${agent.role}-${agent.n}`
      const env = Object.entries(agent.env).flatMap(([key, value]) => ['--env', `${key}=${value}`])
      const made = await herdr(exec, ['tab', 'create', '--cwd', agent.cwd, '--label', name, '--no-focus', ...env])
      const handle = { name, pane: made.root_pane.pane_id, tab: made.tab.tab_id }
      try {
        // pi finds the session to continue, or the one to fork, through the session folder that the arguments name.
        const session = agent.resume === true ? ['--continue'] : agent.fork === undefined ? [] : ['--fork', agent.fork]
        await herdr(exec, ['agent', 'start', name, '--kind', tool.kind, '--pane', handle.pane, '--', ...tool.args(agent), ...session])
      } catch (error) {
        await herdr(exec, ['tab', 'close', handle.tab]).catch(() => {})
        throw error
      }
      return handle
    },

    async prompt(handle, text, onRetry = () => {}) {
      for (let tried = 1; ; tried++) {
        try {
          await herdr(exec, ['agent', 'prompt', handle.name, text, '--wait', '--until', 'working', '--timeout', '20000'])
          return
        } catch (error) {
          if (!RETRY.includes(error.herdr) || tried === TRIES) throw error
          onRetry(tried, error.herdr)
        }
      }
    },

    async activity(handle) {
      let agent
      try {
        agent = (await herdr(exec, ['agent', 'get', handle.name])).agent
      } catch (error) {
        if (error.herdr === 'agent_not_found') return { state: 'gone' }
        throw error
      }
      const state = { working: 'working', blocked: 'blocked', idle: 'idle', done: 'idle' }[agent.agent_status] ?? 'unknown'
      const info = await herdr(exec, ['pane', 'process-info', '--pane', handle.pane])
      return { state, root: info.process_info.shell_pid }
    },

    async close(handle) {
      try {
        await herdr(exec, ['tab', 'close', handle.tab])
      } catch (error) {
        if (!(error.herdr ?? '').endsWith('not_found')) throw error
      }
    },
  }
}
