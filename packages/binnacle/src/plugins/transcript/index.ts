import type { Context } from '@deepseek-ai/cordis'

/** The Transcript plugin's Cordis name. The module is the plugin, as dsh's loader takes a row's: its `name`, `inject` and `apply`, with no default export. */
export const name = 'transcript'

/** The services it needs before it applies: the `binnacle` service it places through. */
export const inject = ['binnacle'] satisfies (keyof Context)[]

/**
 * Place binnacle's transcript in the transcript's slot, where an author could place it or place something newer over it.
 * @param ctx - the plugin's context, holding the `binnacle` service; disposing it takes the placement back.
 */
export function apply(ctx: Context): void {
  ctx.binnacle.place('transcript', { kind: 'transcript' })
}
