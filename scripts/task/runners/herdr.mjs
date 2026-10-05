/**
 * The `herdr` runner: each agent in a herdr tab of its own, where the
 * Maintainer can watch it.
 *
 * herdr answers each command with JSON: `{ "result": ... }`, or
 * `{ "error": { "code", "message" } }`.
 * @module binnacle/scripts/task/runners/herdr
 */
import { toolOf } from './tools.mjs'

/** The herdr errors that a prompt tries again: the agent did not start to work in time. */
const RETRY = ['agent_prompt_stalled', 'timeout']

/** The tries of one prompt, in all. */
const TRIES = 3

/**
 * @typedef {(file: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} Exec
 * @typedef {{ name: string, pane: string, tab: string }} HerdrHandle
 */

/**
 * Run herdr, and answer its result, or throw its error with herdr's code.
 * @param {Exec} exec - runs a process.
 * @param {string[]} args - herdr's arguments.
 * @returns {Promise<object>} herdr's `result`.
 */
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

/**
 * Make the herdr runner.
 * @param {{ exec: Exec }} deps - runs a process.
 * @returns {object} the runner: `start`, `prompt`, `activity` and `close`.
 */
export function makeHerdr({ exec }) {
  return {
    /**
     * Start an agent in a new tab. If the agent does not start, the tab goes.
     * @param {import('./tools.mjs').Agent} agent - the agent.
     * @returns {Promise<HerdrHandle>} the handle.
     */
    async start(agent) {
      const tool = toolOf(agent.role, { tool: agent.tool })
      // herdr wants a name that starts with a lowercase letter.
      const name = `${agent.role}-${agent.n}`
      const env = Object.entries(agent.env).flatMap(([key, value]) => ['--env', `${key}=${value}`])
      const made = await herdr(exec, ['tab', 'create', '--cwd', agent.cwd, '--label', name, '--no-focus', ...env])
      const handle = { name, pane: made.root_pane.pane_id, tab: made.tab.tab_id }
      try {
        await herdr(exec, ['agent', 'start', name, '--kind', tool.kind, '--pane', handle.pane, '--', ...tool.args(agent)])
      } catch (error) {
        await herdr(exec, ['tab', 'close', handle.tab]).catch(() => {})
        throw error
      }
      return handle
    },

    /**
     * Send a prompt, and resolve when the agent works on it. herdr's wait sees
     * the agent's state, not this turn, so a try that timed out may have
     * landed: the tries stop at three.
     * @param {HerdrHandle} handle - the agent.
     * @param {string} text - the prompt.
     * @param {(tried: number, code: string) => void} [onRetry] - told of each try that is tried again.
     * @returns {Promise<void>}
     */
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

    /**
     * What the agent does, and the process to look under for its children.
     * @param {HerdrHandle} handle - the agent.
     * @returns {Promise<{ state: string, root?: number }>} the state.
     */
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

    /**
     * Close the agent's tab. A tab that is gone is a step already done.
     * @param {HerdrHandle} handle - the agent.
     * @returns {Promise<void>}
     */
    async close(handle) {
      try {
        await herdr(exec, ['tab', 'close', handle.tab])
      } catch (error) {
        if (!(error.herdr ?? '').endsWith('not_found')) throw error
      }
    },
  }
}
