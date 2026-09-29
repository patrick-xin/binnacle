import type { Context } from '@deepseek-ai/cordis'
import { drawTrajectory } from './draw.ts'

/** The Trajectory plugin, loaded by the host beside the surface it draws on. */
export const trajectory = {
  name: 'trajectory',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.screen('trajectory', {
      key: 'ctrl+o',
      description: 'open the trajectory: every event the session logged',
      draw: drawTrajectory,
    })
  },
}
