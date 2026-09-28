/**
 * The Status line: one line under the composer naming the model the session
 * runs, as `provider/model`, muted. A built-in plugin, holding only what an
 * author holds: the `binnacle` service, to place its line where an author
 * could place one of their own; and dsh's default model, to read the model
 * the session opens on.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Status line plugin, loaded by the host beside the surface it draws on. */
export const statusLine = {
  name: 'status-line',
  inject: ['binnacle', 'agentDefaultModel'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    // Read where the session reads it, once: the line names what the session opened on, not what the default turns to later.
    const { provider, model } = ctx.agentDefaultModel.currentSelection()
    const named = `${provider}/${model}`
    ctx.binnacle.place('below-composer', { kind: 'lines', draw: () => ({ kind: 'text', text: named, tone: 'muted' }) })
  },
}
