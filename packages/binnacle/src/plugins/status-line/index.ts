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
    // Named once, at the first drawing: that follows the session's opening, which reads the selection it runs. What
    // the default turns to after that is the live session's to say, not the default's, until it is moved onto it.
    let named: string | undefined
    ctx.binnacle.place('below-composer', {
      kind: 'lines',
      draw: () => {
        if (named === undefined) {
          const { provider, model } = ctx.agentDefaultModel.currentSelection()
          named = `${provider}/${model}`
        }
        return { kind: 'text', text: named, tone: 'muted' }
      },
    })
  },
}
