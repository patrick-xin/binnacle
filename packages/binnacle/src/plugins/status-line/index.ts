import type { Context } from '@deepseek-ai/cordis'
import type { ChatSession } from '../../index.ts'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-status-line'

export const inject = ['binnacle', 'binnacleSession'] satisfies (keyof Context)[]

function lineOf({ id, agent }: ChatSession): string {
  const said = agent === undefined ? ['read only', id] : [agent.status, agent.options.model]
  return said
    .filter((each) => each !== undefined)
    .map(toPlainText)
    .join(' · ')
}

export function apply(ctx: Context): void {
  const chat = ctx.binnacleSession
  const placed = ctx.binnacle.place('status', { lines: () => [lineOf(chat)] })
  ctx.on('agent/status', ({ agent }) => {
    if (agent === chat.agent) placed.redraw()
  })
}
