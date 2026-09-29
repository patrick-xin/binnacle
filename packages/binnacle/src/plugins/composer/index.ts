import type { Context } from '@deepseek-ai/cordis'

/** The Composer plugin's Cordis name. The module is the plugin, as dsh's loader takes a row's: its `name`, `inject` and `apply`, with no default export. */
export const name = 'composer'

/** The services it needs before it applies: the `binnacle` service it places through and sends with. */
export const inject = ['binnacle'] satisfies (keyof Context)[]

/**
 * Place binnacle's composer, sending each submitted line, or running it when it names one of dsh's commands.
 * @param ctx - the plugin's context, holding the `binnacle` service; disposing it takes the placement back.
 */
export function apply(ctx: Context): void {
  ctx.binnacle.place('composer', {
    kind: 'composer',
    submit: (text) => {
      // A blank line is not sent.
      if (text.trim() === '') return
      if (!text.startsWith('/')) {
        ctx.binnacle.send(text)
        return
      }
      // A line naming one of dsh's commands runs it; one naming none is prose, sent as any other line. The command
      // settles after this submit has returned, and the session may be gone by then, so each step keeps what it throws.
      ctx.binnacle.command(text).then((ran) => {
        if (ran) return
        try {
          ctx.binnacle.send(text)
        } catch {
          // The session closed under the line: there is nothing left to send it to.
        }
      }, () => {
        // The session closed under the line: there is nothing left to run the command on — a command that failed
        // still ran, its failure logged as its done, so the grant resolves rather than rejecting.
      })
    },
  })
}
