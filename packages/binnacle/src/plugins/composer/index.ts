/**
 * The Composer: where a person types a line and sends it, under the
 * transcript. A built-in plugin, holding only what an author holds: the
 * `binnacle` service, to place binnacle's composer where an author could
 * place it, or place something newer over it, and to send what the person
 * submits through the grant an author would.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Composer plugin, loaded by the host beside the surface it draws on. */
export const composer = {
  name: 'composer',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    // A blank line is not sent.
    ctx.binnacle.place('composer', { kind: 'composer', submit: (text) => { if (text.trim() !== '') ctx.binnacle.send(text) } })
  },
}
