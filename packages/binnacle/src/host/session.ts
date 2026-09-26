/**
 * The session the surface draws: one agent, created through dsh on the
 * default model, and its session log followed from the first event.
 *
 * It composes no preset roster, as dsh's headless bundle does not: the agent
 * reads its rows from the global layer, and its model from the default
 * selection installed in `setup` (`dsh:packages/bundle/headless/src/index.ts`).
 * This is where binnacle reaches dsh's agents (ADR 3); the rest of the host
 * knows only the session it opens.
 * @module binnacle/host/session
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

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
   * Send a line from the person: it follows up the running turn, or starts one.
   * @param text - what they typed.
   */
  send(text: string): void
  /** Stop the agent and remove it; the session log stays where dsh stored it. */
  close(): Promise<void>
}

/**
 * Open a session on the default model.
 * @param ctx - the row's context, carrying dsh's `agents` and `agentDefaultModel`.
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
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    close: () => handle.dispose(),
  }
}
