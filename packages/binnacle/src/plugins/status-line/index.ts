/**
 * The Status line: one line under the composer naming the model the session
 * runs, as `provider/model`, muted. A built-in plugin, holding only what an
 * author holds: the `binnacle` service, to place its line where an author
 * could place one of their own; and dsh's default model and startup
 * readiness, to read the selection the session opens on at the tick it
 * reads it.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Status line plugin, loaded by the host beside the surface it draws on. */
export const statusLine = {
  name: 'status-line',
  inject: ['binnacle', 'agentDefaultModel', 'appReady'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    const ready = ctx.appReady
    if (ready === undefined) throw new Error('status-line: the launcher must provide ctx.appReady before the tree mounts')
    // Named at the commit of startup, the tick the session itself reads the selection it runs: the readiness listeners
    // run in one go, with no turn of the loop between them, so however the default changes around the opening — before
    // the commit, or while the agent is being created — the line and the session cannot disagree. What the default
    // turns to after is the live session's to say, not the default's.
    let named: string | undefined
    ctx.effect(() => ready.onReady(() => {
      const { provider, model } = ctx.agentDefaultModel.currentSelection()
      named = `${provider}/${model}`
    }), 'status-line: the model named at startup')
    // The surface draws nothing before the commit, for the session opens only then, so the line is always named by its first drawing.
    ctx.binnacle.place('below-composer', {
      kind: 'lines',
      draw: () => ({ kind: 'text', text: named ?? '', tone: 'muted' }),
    })
  },
}
