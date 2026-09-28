/**
 * The Composer: where a person types a line and sends it, under the
 * transcript. A built-in plugin, holding only what an author holds: the
 * `binnacle` service, to place binnacle's composer where an author could
 * place it, or place something newer over it.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Composer plugin, loaded by the host beside the surface it draws on. */
export const composer = {
  name: 'composer',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.place('composer', { kind: 'composer' })
  },
}
