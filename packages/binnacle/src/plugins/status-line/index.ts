import type { Context } from '@deepseek-ai/cordis'
// Type-only: `ProjectionSnapshot` arrives with the `sessionProjections` Context declaration, and the token meter's
// projections augment the keys a snapshot may ask for.
import type { ProjectionSnapshot } from '@deepseek-ai/dsh-session-projection'
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'

export const name = 'status-line'

/** `sessionProjections` is where it reads the token meter's projections from. */
export const inject = ['binnacle', 'sessionProjections'] satisfies (keyof Context)[]

/** It reads from dsh as its line is drawn and at no tick of its own: lines are drawn again as the session logs anything and as its agent starts or ends a turn. */
export function apply(ctx: Context): void {
  // The token meter's projections change on dsh's own feed, which the line follows as well as the session's events.
  ctx.sessionProjections.onChanged(() => { ctx.binnacle.redraw() })
  ctx.binnacle.place('below-composer', {
    kind: 'lines',
    draw: (_facts, surface) => ({ kind: 'text', text: surface.notice ?? measured(ctx).join(' · '), tone: 'muted' }),
  })
}

/** The model its session last asked for, or before its first request the one it opened on; each other measure is left out until known. */
function measured(ctx: Context): readonly string[] {
  const agent = ctx.binnacle.agent()
  const { provider, model } = agent.session.requestHeader()?.config ?? agent.options
  // One cut of the log, read as the line is drawn; parsed here, for a projection is data from code binnacle does not own.
  const { values }: ProjectionSnapshot = ctx.sessionProjections.snapshot(agent.session, ['tokenUsage', 'contextPressure'])
  const parts = [`${provider}/${model}`]
  const tokens = tokensOf(values.tokenUsage)
  if (tokens !== undefined) parts.push(`${compact(tokens)} tokens`)
  const context = contextOf(values.contextPressure)
  if (context !== undefined) parts.push(`${share(context.used, context.window)} of context`)
  return parts
}

const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/**
 * The tokens used, from the token meter's `tokenUsage` projection (`dsh:packages/llm/token-meter/src/projection.ts#TokenUsageProjection`): sent, received and read from the cache.
 * A field that holds no count leaves the measure out, never guessed: undefined until each is counted.
 */
function tokensOf(value: TokenUsageProjection | undefined): number | undefined {
  if (value === undefined) return undefined
  const input = count(value.uncachedInputTokens)
  const output = count(value.outputTokens)
  const cacheRead = count(value.cacheReadTokens)
  return input === undefined || output === undefined || cacheRead === undefined ? undefined : input + output + cacheRead
}

/**
 * The context the session fills, from the token meter's `contextPressure` projection
 * (`dsh:packages/llm/token-meter/src/projection.ts#ContextPressureProjection`): what the next request would cost, or
 * the last one's size, out of the window the latest request context named.
 * A field that holds no count leaves the measure out, never guessed: undefined until both are known.
 */
function contextOf(value: ContextPressureProjection | undefined): { readonly used: number, readonly window: number } | undefined {
  if (value === undefined) return undefined
  const used = count(value.projectedTokens) ?? count(value.pressureTokens)
  const window = count(value.contextWindow)
  return used === undefined || window === undefined || window === 0 ? undefined : { used, window }
}

/**
 * A count scaled down from a unit, as a person reads it: rounded to a whole once a hundred, one decimal beneath
 * that — dsh web's compact count's own rule (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`).
 */
function scaled(over: number): string {
  return over >= 100 ? `${Math.round(over)}` : `${Math.round(over * 10) / 10}`
}

/**
 * A count of tokens as a person reads it: `517`, `12.4k`, `517k`, `1.2m` — dsh web's compact count
 * (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`), restated lowercase and without its
 * locale seat, as #42's worked example writes it. Where a count rounds to a thousand thousands it is written in
 * millions, where dsh web writes `1000K`.
 */
function compact(value: number): string {
  if (value < 1_000) return `${value}`
  const thousands = scaled(value / 1_000)
  if (value < 1_000_000 && thousands !== '1000') return `${thousands}k`
  return `${scaled(value / 1_000_000)}m`
}

/**
 * The share of the context the session fills, rounded as dsh web's occupancy meter rounds it
 * (`dsh:packages/client/ui-conversation/src/client/context-occupancy.ts#contextOccupancy`): to a whole, never past
 * full.
 */
function share(used: number, window: number): string {
  return `${Math.min(100, Math.round(used / window * 100))}%`
}
