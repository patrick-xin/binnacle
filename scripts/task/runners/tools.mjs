/**
 * The agent tools the task tool can start, each with the arguments it takes.
 *
 * A later spec adds Claude Code or Codex as one row of `TOOLS`.
 * @module binnacle/scripts/task/runners/tools
 */

/**
 * An agent the task tool starts: what `.agents/roles.json` says of its role,
 * and where it works.
 * @typedef {{ n: number, role: string, tool: string, model: string, thinking?: string, cwd: string, sessionDir: string, env: Record<string, string> }} Agent
 */

/** Each tool, with its herdr kind, its executable and its arguments. */
export const TOOLS = {
  pi: {
    kind: 'pi',
    file: 'pi',
    /**
     * The arguments that start pi for an agent.
     * @param {Agent} agent - the agent.
     * @returns {string[]} the arguments.
     */
    args(agent) {
      return [
        '--model',
        agent.model,
        ...(agent.thinking === undefined ? [] : ['--thinking', agent.thinking]),
        '--session-dir',
        agent.sessionDir,
      ]
    },
  },
}

/**
 * The tool of a role, as its setting names it.
 * @param {string} role - the role.
 * @param {{ tool?: string }} setting - the role's row of `.agents/roles.json`.
 * @returns {(typeof TOOLS)[keyof typeof TOOLS]} the tool.
 * @throws {Error} when the task tool cannot start the setting's tool.
 */
export function toolOf(role, setting) {
  const tool = TOOLS[setting.tool]
  if (tool === undefined)
    throw new Error(`the ${role} uses ${setting.tool ?? 'no tool'}, and the task tool starts only ${Object.keys(TOOLS).join(', ')}`)
  return tool
}
