import type { Context } from '@deepseek-ai/cordis'

export const name = 'composer'

export const inject = ['binnacle'] satisfies (keyof Context)[]

export function apply(ctx: Context): void {
  ctx.binnacle.place('composer', {
    kind: 'composer',
    submit: (text) => {
      if (text.trim() === '') return
      if (!text.startsWith('/')) {
        ctx.binnacle.send(text)
        return
      }
      ctx.binnacle.command(text).then((ran) => {
        if (ran) return
        try {
          ctx.binnacle.send(text)
        } catch {
          // The session closed under the line: there is nothing left to send it to.
        }
      }, () => {
        // Session closed; command already logged and settled.
      })
    },
  })
}
