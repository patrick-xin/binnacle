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
import type { CommandRuntime } from '@deepseek-ai/dsh-commands'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: `ProjectionSnapshot` arrives with the `sessionProjections` Context declaration, and the token meter's
// projections augment the keys a snapshot may ask for.
import type { ProjectionSnapshot } from '@deepseek-ai/dsh-session-projection'
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
// Type-only: the subagent catalog and timing projections augment the keys a snapshot may ask for.
import type { SubagentTimingProjection } from '@deepseek-ai/dsh-subagent'
import type { Delegated, Surface } from '../api.ts'

/** Where the session stands, as the host reads it from the live session; the notice is the host's own. */
export type SessionStands = Omit<Surface, 'notice'>

/** An open session: what the surface reads from it and sends to it. */
export interface OpenedSession {
  /** The model it runs, as `provider/model`. */
  readonly model: string
  /** The agent whose session this is: the scope its approvals are answered under, and the identity of everything it logs. */
  readonly agent: Agent
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
  /**
   * Observe another session's log, a child agent's: the events it logged so far, then each as it is logged, in order
   * and once each.
   * @param sessionId - the session's id.
   * @param listener - called with each event.
   * @returns once caught up, a function that stops observing.
   * @throws when dsh cannot observe the session, saying why.
   */
  observe(sessionId: string, listener: (event: SessionEvent) => void): Promise<() => void>
  /** Where the session stands now: the model it runs, whether a turn runs, and what dsh has measured. */
  standing(): SessionStands
  /**
   * Hear when where the session stands may have changed: as it logs anything, as the agent's own status flips, and as
   * an agent it delegated to flips or logs.
   * @param listener - called on each change.
   * @returns a function that stops listening.
   */
  onStanding(listener: () => void): () => void
  /**
   * Run a line as one of dsh's commands for the agent, without sending it to the model
   * (`dsh:packages/interaction/commands/src/index.ts`). A command that failed still
   * ran — dsh logs its failure as the command's `done` before rethrowing, and the
   * failure is drawn from the log — so it is contained here.
   * @param line - the line, as the person wrote it.
   * @returns whether a command ran, whatever it returned; false when no command has the name.
   */
  command(line: string): Promise<boolean>
  /**
   * What `/` offers: dsh's commands for the agent, and the skills a person may invoke, as dsh's web lists them
   * (`dsh:packages/api/session-controller/src/skill-catalog.ts`).
   * @returns each by name, with what it does.
   */
  offers(): Promise<readonly { readonly name: string, readonly description: string }[]>
  /**
   * Hear when what `/` offers may have changed: dsh's commands, or its skills.
   * @param listener - called on each change.
   * @returns a function that stops listening.
   */
  onOffers(listener: () => void): () => void
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
 * The agents a session delegated to, from its `subagentCatalog` projection
 * (`dsh:packages/subagent/subagent/src/projection-types.ts#SubagentCatalogEntry`), each read live where dsh's
 * registry still holds it: working while its status is `running`, and its open turn's start from its own
 * `subagentTiming` projection. A child the registry no longer holds — a one-shot child that finished — is named, not
 * working.
 * @param catalog - the parent's catalog, parsed where it enters: a row with no id is left out, a mode dsh did not name is `unknown`.
 * @param live - the registry's agent for a child, if it holds one.
 * @param timing - a live child's timing projection.
 * @returns the agents, or nothing while there are none.
 */
function delegatedOf(
  catalog: unknown,
  live: (id: string) => { readonly status: string, readonly session: object } | undefined,
  timing: (session: object) => SubagentTimingProjection | undefined,
): Pick<SessionStands, 'agents'> {
  if (!Array.isArray(catalog)) return {}
  const agents = catalog.flatMap((row: unknown): Delegated[] => {
    if (typeof row !== 'object' || row === null) return []
    const { id, label, mode } = row as { readonly id?: unknown, readonly label?: unknown, readonly mode?: unknown }
    if (typeof id !== 'string') return []
    const agent = live(id)
    const since = agent === undefined ? undefined : count(timing(agent.session)?.active?.since)
    return [{
      id,
      ...typeof label === 'string' ? { label } : {},
      mode: mode === 'one-shot' || mode === 'continuable' ? mode : 'unknown',
      working: agent?.status === 'running',
      ...since === undefined ? {} : { since },
    }]
  })
  return agents.length === 0 ? {} : { agents }
}

/**
 * Open a session on the default model.
 * @param ctx - the row's context, carrying dsh's `agents`, `agentDefaultModel`, `sessionProjections`, `commands` and `sessionQuery`.
 * @returns the open session.
 */
export async function openSession(ctx: Context): Promise<OpenedSession> {
  const defaults: AgentDefaultModelConfig = ctx.agentDefaultModel
  const selection = defaults.currentSelection()
  // Where the session stands is heard on two doors: the agent flips to idle after the last event of its turn is
  // logged — kick's finally sets the phase only after `turn/end` is appended, and says so as `agent/status`
  // (`dsh:packages/core/agent-loop/src/agent.ts`) — so a listener on session events alone would keep reading a
  // running turn; and the projections and the model it last asked for ride the events themselves.
  const standsChanged = new Set<() => void>()
  const restand = (): void => { for (const listener of standsChanged) listener() }
  const handle: AgentHandle = await ctx.agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
      // Scoped to this agent, and gone with its world when the handle is disposed.
      agentCtx.on('agent/status', restand)
    },
  })
  const { session } = handle.agent
  const commands: CommandRuntime = ctx.commands
  const query: SessionQueryEngine = ctx.sessionQuery
  return {
    model: `${selection.provider}/${selection.model}`,
    agent: handle.agent,
    follow: (listener) => {
      // Drained and subscribed in one synchronous run, so no event can fall between them.
      for (const event of session.snapshotEvents()) listener(event)
      return ctx.on('session/event', (from, event) => { if (from === session) listener(event) })
    },
    observe: async (sessionId, listener) => {
      // Subscribed before the cut is read, so an event logged while dsh reads it is held, not lost; each is handed once,
      // past the last seq handed, so one the cut already held is not handed twice.
      let last = -1
      let caughtUp = false
      let stopped = false
      const held: SessionEvent[] = []
      const hand = (event: SessionEvent): void => {
        if (stopped || event.seq <= last) return
        last = event.seq
        listener(event)
      }
      const off = ctx.on('session/event', (from, event) => {
        if (from.id !== sessionId) return
        if (caughtUp) hand(event)
        else held.push(event)
      })
      try {
        // One cut of the log, from the live session or its persisted copy (`dsh:packages/session-query/session-query/src/observation.ts#SessionObservation`), released once read.
        const observation = await query.observeSession(SessionId(sessionId), { projectionMode: 'none' })
        try {
          for (const event of observation.events) hand(event)
        } finally {
          observation[Symbol.dispose]()
        }
      } catch (error) {
        off()
        throw error
      }
      caughtUp = true
      for (const event of held) hand(event)
      return () => { stopped = true; off() }
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
      const values: ProjectionSnapshot['values'] = ctx.sessionProjections.snapshot(session, ['tokenUsage', 'contextPressure', 'subagentCatalog']).values
      const agents = delegatedOf(
        values.subagentCatalog,
        id => ctx.agents.get(SessionId(id)),
        child => ctx.sessionProjections.snapshot(child as typeof session, ['subagentTiming']).values.subagentTiming,
      )
      return { model, running: handle.agent.status === 'running', ...usageOf(values.tokenUsage), ...contextOf(values.contextPressure), ...agents }
    },
    onStanding: (listener) => {
      standsChanged.add(listener)
      // An agent the session delegated to stands in the surface too: its status flips on dsh's root, which hears every
      // agent's (`dsh:packages/core/agent/src/invariant.ts`), and its timing rides its own session's events. Another
      // session's events are not this surface's.
      const stops = [
        ctx.on('session/event', (from) => { if (from === session || ctx.agents.isOwnedBy(from.id, handle.agent)) listener() }),
        ctx.on('agent/status', ({ agent }) => { if (agent !== handle.agent) listener() }),
      ]
      return () => { standsChanged.delete(listener); for (const stop of stops) stop() }
    },
    offers: async () => {
      const named = commands.list(handle.agent).map(({ name, description }) => ({ name, description }))
      const skills = await ctx.get('skills')?.list({ cwd: process.cwd(), scope: handle.agent }) ?? []
      return [...named, ...skills.filter(isUserInvocable).map(({ name, description }) => ({ name, description }))]
    },
    onOffers: (listener) => {
      const stops = [ctx.on('commands/change', listener), ctx.on('skills/change', listener)]
      return () => { for (const stop of stops) stop() }
    },
    command: async (line) => {
      try {
        return await commands.execute(handle.agent, line, [], new AbortController().signal) !== undefined
      } catch {
        // dsh's executor rethrows a failed command's own failure after logging it as the command's `done`
        // (`dsh:packages/interaction/commands/src/index.ts`): the command ran, and what it did is on the log, so the
        // grant keeps its contract — it resolves, and throws only where the session is gone.
        return true
      }
    },
    get running() { return handle.agent.status === 'running' },
    interrupt: () => { handle.agent.cancel({ kind: 'user' }, { keepInbox: true }) },
    close: () => handle.dispose(),
  }
}
