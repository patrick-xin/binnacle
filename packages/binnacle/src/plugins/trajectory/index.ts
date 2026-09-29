import type { Context } from '@deepseek-ai/cordis'
import { drawTrajectory } from './draw.ts'

/** The Trajectory plugin's Cordis name. The module is the plugin, as dsh's loader takes a row's: its `name`, `inject` and `apply`, with no default export. */
export const name = 'trajectory'

/** The services it needs before it applies: the `binnacle` service it places its screen through. */
export const inject = ['binnacle'] satisfies (keyof Context)[]

/**
 * Place the Trajectory's screen, and the key that opens it.
 * @param ctx - the plugin's context, holding the `binnacle` service; disposing it takes the screen back.
 */
export function apply(ctx: Context): void {
  ctx.binnacle.screen('trajectory', {
    key: 'ctrl+o',
    description: 'open the trajectory: every event the session logged',
    draw: drawTrajectory,
  })
}
