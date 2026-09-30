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

/** An open session: what the surface reads from it and sends to it. */
export interface OpenedSession {
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
   * Hear when where the session stands may have changed: as it logs anything, and as the agent's own status flips.
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
  /** Interrupt the running turn, keeping what waits in the agent's inbox, as dsh's web does; with none running, nothing. */
  interrupt(): void
  /** Stop the agent and remove it; the session log stays where dsh stored it. */
  close(): Promise<void>
}

/**
 * Open a session on the default model. It composes no preset roster, as dsh's headless bundle does not: the agent
 * reads its rows from the global layer, and its model from the default selection installed in `setup`
 * (`dsh:packages/bundle/headless/src/index.ts`).
 * @param ctx - the row's context, carrying dsh's `agents` and `agentDefaultModel`.
 * @returns the open session.
 */
export async function openSession(ctx: Context): Promise<OpenedSession> {
  const defaults: AgentDefaultModelConfig = ctx.agentDefaultModel
  const selection = defaults.currentSelection()
  // What lines read of the session changes on two doors: the agent flips to idle after the last event of its turn is
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
  return {
    agent: handle.agent,
    follow: (listener) => {
      // Drained and subscribed in one synchronous run, so no event can fall between them.
      for (const event of session.snapshotEvents()) listener(event)
      return ctx.on('session/event', (from, event) => { if (from === session) listener(event) })
    },
    send: (text) => {
      handle.agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    onStanding: (listener) => {
      standsChanged.add(listener)
      const off = ctx.on('session/event', (from) => { if (from === session) listener() })
      return () => { standsChanged.delete(listener); off() }
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
    interrupt: () => { handle.agent.cancel({ kind: 'user' }, { keepInbox: true }) },
    close: () => handle.dispose(),
  }
}
