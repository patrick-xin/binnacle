import type { Context } from '@deepseek-ai/cordis'
import type { ChatSession } from '../../index.ts'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-status-line'

export const inject = ['binnacle'] satisfies (keyof Context)[]

function lineOf({ id, agent }: ChatSession): string {
  const said = agent === undefined ? ['read only', id] : [agent.status, agent.options.model]
  return said
    .filter((each) => each !== undefined)
    .map(toPlainText)
    .join(' · ')
}

export function apply(plugin: Context): void {
  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  plugin.inject(['binnacleSession'], (ctx) => {
    const chat = ctx.binnacleSession
    const placed = ctx.binnacle.place('status', { lines: () => [lineOf(chat)] })
    ctx.on('agent/status', ({ agent }) => {
      if (agent === chat.agent) placed.redraw()
    })
  })
}
