import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-transcript'

export const inject = ['binnacle', 'binnacleSession'] satisfies (keyof Context)[]

function linesOf(event: SessionEvent): string[] {
  return [`#${event.seq} ${toPlainText(event.type)}`, ...JSON.stringify(event.data, null, 2).split('\n'), '']
}

export function apply(ctx: Context): void {
  const lines = ctx.binnacleSession.events.flatMap(linesOf)
  ctx.binnacle.place('transcript', { lines: () => lines })
}
