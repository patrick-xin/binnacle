import type { Context } from '@deepseek-ai/cordis'

export const name = 'transcript'

export const inject = ['binnacle'] satisfies (keyof Context)[]

export function apply(ctx: Context): void {
  ctx.binnacle.place('transcript', { kind: 'transcript' })
}
