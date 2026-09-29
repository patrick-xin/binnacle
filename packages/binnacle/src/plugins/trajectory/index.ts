import type { Context } from '@deepseek-ai/cordis'
import { drawTrajectory } from './draw.ts'

export const name = 'trajectory'

export const inject = ['binnacle'] satisfies (keyof Context)[]

export function apply(ctx: Context): void {
  ctx.binnacle.screen('trajectory', {
    key: 'ctrl+o',
    description: 'open the trajectory: every event the session logged',
    draw: drawTrajectory,
  })
}
