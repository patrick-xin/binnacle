export const TOOLS = {
  pi: {
    kind: 'pi',
    file: 'pi',
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

export function toolOf(role, setting) {
  const tool = TOOLS[setting.tool]
  if (tool === undefined)
    throw new Error(`the ${role} uses ${setting.tool ?? 'no tool'}, and the task tool starts only ${Object.keys(TOOLS).join(', ')}`)
  return tool
}
