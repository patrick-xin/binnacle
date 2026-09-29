/**
 * The Status line: one line under the composer saying what the session runs
 * and where it stands — the model it runs, the tokens it has used and the
 * share of its context, muted — with a notice in its place while one stands. A built-in plugin, holding only what an
 * author holds: the `binnacle` service, to place its line where an author
 * could place one of their own. What it says arrives in the surface the host
 * hands every lines drawing, read live from the session, so it names no
 * service of dsh's and reads nothing at any tick of its own.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Surface } from '../../api.ts'

/** The Status line plugin, loaded by the host beside the surface it draws on. */
export const statusLine = {
  name: 'status-line',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.place('below-composer', {
      kind: 'lines',
      draw: (_facts, surface) => ({ kind: 'text', text: lineOf(surface), tone: 'muted' }),
    })
  },
}

/**
 * What the status line says: the notice while one stands, in the line's
 * place; otherwise the model the session runs, the tokens it has used and
 * the share of its context, each measure as it is known, joined by ` · `.
 * @param surface - where the session stands.
 * @returns the line's text.
 */
function lineOf(surface: Surface): string {
  if (surface.notice !== undefined) return surface.notice
  const parts = [surface.model]
  if (surface.usage !== undefined) parts.push(`${compact(surface.usage.input + surface.usage.output + surface.usage.cacheRead)} tokens`)
  if (surface.context !== undefined) parts.push(`${share(surface.context.used, surface.context.window)} of context`)
  return parts.join(' · ')
}

/**
 * A count scaled down from a unit, as a person reads it: rounded to a whole once a hundred, one decimal beneath
 * that — dsh web's compact count's own rule (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`).
 * @param over - the count over the unit.
 * @returns it, as written.
 */
function scaled(over: number): string {
  return over >= 100 ? `${Math.round(over)}` : `${Math.round(over * 10) / 10}`
}

/**
 * A count of tokens as a person reads it: `517`, `12.4k`, `517k`, `1.2m` — dsh web's compact count
 * (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`), restated lowercase and without its
 * locale seat, as #42's worked example writes it.
 * @param value - the count.
 * @returns it, compact.
 */
function compact(value: number): string {
  if (value < 1_000) return `${value}`
  if (value < 1_000_000) return `${scaled(value / 1_000)}k`
  return `${scaled(value / 1_000_000)}m`
}

/**
 * The share of the context the session fills, rounded as dsh web's occupancy meter rounds it
 * (`dsh:packages/client/ui-conversation/src/client/context-occupancy.ts#contextOccupancy`): to a whole, never past
 * full.
 * @param used - the tokens the session's context fills.
 * @param window - the window it fills.
 * @returns the share, as `38%`.
 */
function share(used: number, window: number): string {
  return `${Math.min(100, Math.round(used / window * 100))}%`
}
