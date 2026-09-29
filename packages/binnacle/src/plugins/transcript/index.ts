import type { Context } from '@deepseek-ai/cordis'

/** The Transcript plugin, loaded by the host beside the surface it draws on. */
export const transcript = {
  name: 'transcript',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.place('transcript', { kind: 'transcript' })
  },
}
