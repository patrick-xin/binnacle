/**
 * The Composer: where a person types a line and sends it, under the
 * transcript. A built-in plugin, holding only what an author holds: the
 * `binnacle` service, to place binnacle's composer where an author could
 * place it, or place something newer over it, and to send what the person
 * submits, or run it as one of dsh's commands, through the grants an author
 * would.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Composer plugin, loaded by the host beside the surface it draws on. */
export const composer = {
  name: 'composer',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.place('composer', {
      kind: 'composer',
      submit: (text) => {
        // A blank line is not sent.
        if (text.trim() === '') return
        if (!text.startsWith('/')) {
          ctx.binnacle.send(text)
          return
        }
        // A line naming one of dsh's commands runs it; one naming none is prose, sent as any other line.
        ctx.binnacle.command(text).then((ran) => { if (!ran) ctx.binnacle.send(text) }, () => {
          // The command grant rejects only once the session has closed under the line: there is nothing to run it on.
        })
      },
    })
  },
}
