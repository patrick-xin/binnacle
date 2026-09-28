/**
 * The Transcript: the session log drawn as turns, in the transcript's place.
 * A built-in plugin, holding only what an author holds: the `binnacle`
 * service, to place binnacle's transcript where an author could place it, or
 * place something newer over it.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Transcript plugin, loaded by the host beside the surface it draws on. */
export const transcript = {
  name: 'transcript',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.place('transcript', { kind: 'transcript' })
  },
}
