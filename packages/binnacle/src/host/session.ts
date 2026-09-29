/**
 * The session the surface draws: one agent, created through dsh on the
 * default model, and its session log followed from the first event.
 *
 * It composes no preset roster, as dsh's headless bundle does not: the agent
 * reads its rows from the global layer, and its model from the default
 * selection installed in `setup` (`dsh:packages/bundle/headless/src/index.ts`).
 * This is where binnacle reaches dsh's agents; the rest of the host
 * knows only the session it opens.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: `ProjectionSnapshot` arrives with the `sessionProjections` Context declaration, and the token meter's
// projections augment the keys a snapshot may ask for.
import type { ProjectionSnapshot } from '@deepseek-ai/dsh-session-projection'
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import type { Surface } from '../api.ts'

/** Where the session stands, as the host reads it from the live session; the notice is the host's own. */
export type SessionStands = Omit<Surface, 'notice'>

/** An open session: what the surface reads from it and sends to it. */
export interface OpenedSession {
  /** The model it runs, as `provider/model`. */
  readonly model: string
  /**
   * Hear every event of the session: those logged so far, then each as it is logged, in order and once each.
   * @param listener - called with each event.
   * @returns a function that stops listening.
   */
  follow(listener: (event: SessionEvent) => void): () => void
  /**
   * Send a line from the person: it steers the agent, reaching a turn already running at its next step, or starting
   * one when none runs (`dsh:packages/core/agent-loop/src/agent.ts`, where `steer` sends to the next step).
   * @param text - what they typed.
   */
  send(text: string): void
  /** Where the session stands now: the model it runs, whether a turn runs, and what dsh has measured. */
  standing(): SessionStands
  /**
   * Hear when where the session stands may have changed: as it logs anything.
   * @param listener - called on each change.
   * @returns a function that stops listening.
   */
  onStanding(listener: () => void): () => void
  /** Whether a turn is running now, as the agent says. */
  readonly running: boolean
  /** Interrupt the running turn, keeping what waits in the agent's inbox, as dsh's web does; with none running, nothing. */
  interrupt(): void
  /** Stop the agent and remove it; the session log stays where dsh stored it. */
  close(): Promise<void>
}

/**
 * A count, when a projection holds one.
 * @param value - what the projection holds.
 * @returns the count, or undefined when it is none.
 */
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/**
 * The tokens used, from the token meter's `tokenUsage` projection (`dsh:packages/llm/token-meter/src/projection.ts#TokenUsageProjection`).
 * @param value - the projection's value, parsed where it enters: a field that holds no count is left out, never guessed.
 * @returns the usage, or nothing when the projection holds none.
 */
function usageOf(value: TokenUsageProjection | undefined): Pick<SessionStands, 'usage'> {
  if (value === undefined) return {}
  const input = count(value.uncachedInputTokens)
  const output = count(value.outputTokens)
  const cacheRead = count(value.cacheReadTokens)
  return input === undefined || output === undefined || cacheRead === undefined ? {} : { usage: { input, output, cacheRead } }
}

/**
 * The context the session fills, from the token meter's `contextPressure` projection
 * (`dsh:packages/llm/token-meter/src/projection.ts#ContextPressureProjection`): what the next request would cost, or
 * the last one's size, out of the window the latest request context named.
 * @param value - the projection's value, parsed where it enters: a field that holds no count is left out, never guessed.
 * @returns the context, or nothing until both are known.
 */
function contextOf(value: ContextPressureProjection | undefined): Pick<SessionStands, 'context'> {
  if (value === undefined) return {}
  const used = count(value.projectedTokens) ?? count(value.pressureTokens)
  const window = count(value.contextWindow)
  return used === undefined || window === undefined || window === 0 ? {} : { context: { used, window } }
}

/**
 * Open a session on the default model.
 * @param ctx - the row's context, carrying dsh's `agents`, `agentDefaultModel` and `sessionProjections`.
 * @returns the open session.
 */
export async function openSession(ctx: Context): Promise<OpenedSession> {
  const defaults: AgentDefaultModelConfig = ctx.agentDefaultModel
  const selection = defaults.currentSelection()
  const handle: AgentHandle = await ctx.agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
    },
  })
  const { session } = handle.agent
  return {
    model: `${selection.provider}/${selection.model}`,
    follow: (listener) => {
      // Drained and subscribed in one synchronous run, so no event can fall between them.
      for (const event of session.snapshotEvents()) listener(event)
      return ctx.on('session/event', (from, event) => { if (from === session) listener(event) })
    },
    send: (text) => {
      handle.agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    standing: () => {
      // The model the session last asked for, from its latest request header; before its first request, the one it
      // opened on (the reading on #42: the agent's options are fixed at creation).
      const asked = session.requestHeader()?.config
      const model = asked === undefined ? `${selection.provider}/${selection.model}` : `${asked.provider}/${asked.model}`
      // The token meter's projections, where dsh-base mounts them, read as one cut of the log and parsed here: a
      // registry without them refuses the row, for the service is one the row names in inject, not one it may miss.
      const values: ProjectionSnapshot['values'] = ctx.sessionProjections.snapshot(session, ['tokenUsage', 'contextPressure']).values
      return { model, running: handle.agent.status === 'running', ...usageOf(values.tokenUsage), ...contextOf(values.contextPressure) }
    },
    onStanding: listener => ctx.on('session/event', (from) => { if (from === session) listener() }),
    get running() { return handle.agent.status === 'running' },
    interrupt: () => { handle.agent.cancel({ kind: 'user' }, { keepInbox: true }) },
    close: () => handle.dispose(),
  }
}
