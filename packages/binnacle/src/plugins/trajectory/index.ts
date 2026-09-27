/**
 * The Trajectory: every event of a session, on a screen of its own. A
 * built-in plugin, holding only what an author holds: the author API,
 * type-only; and the `binnacle` service, to place its screen.
 */

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
