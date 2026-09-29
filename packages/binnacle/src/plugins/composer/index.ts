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
  },
}
