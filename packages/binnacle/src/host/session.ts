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

export interface OpenedSession {
  readonly agent: Agent
  follow(listener: (event: SessionEvent) => void): () => void
  send(text: string): void
  onStanding(listener: () => void): () => void
  command(line: string): Promise<boolean>
  offers(): Promise<readonly { readonly name: string, readonly description: string }[]>
  onOffers(listener: () => void): () => void
  interrupt(): void
  close(): Promise<void>
}

export async function openSession(ctx: Context): Promise<OpenedSession> {
  const defaults: AgentDefaultModelConfig = ctx.agentDefaultModel
  const selection = defaults.currentSelection()
  const standsChanged = new Set<() => void>()
  const restand = (): void => { for (const listener of standsChanged) listener() }
  const handle: AgentHandle = await ctx.agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
      agentCtx.on('agent/status', restand)
    },
  })
  const { session } = handle.agent
  const commands: CommandRuntime = ctx.commands
  return {
    agent: handle.agent,
    follow: (listener) => {
      const held: SessionEvent[] = []
      let replaying = true
      const off = ctx.on('session/event', (from, event) => {
        if (from !== session) return
        if (replaying) held.push(event)
        else listener(event)
      })
      let last = -1
      const hear = (event: SessionEvent): void => {
        if (event.seq <= last) return
        last = event.seq
        listener(event)
      }
      for (const event of session.snapshotEvents()) hear(event)
      for (let event = held.shift(); event !== undefined; event = held.shift()) hear(event)
      replaying = false
      return off
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
        // Command ran and logged its failure, so the contract holds.
        return true
      }
    },
    interrupt: () => { handle.agent.cancel({ kind: 'user' }, { keepInbox: true }) },
    close: () => handle.dispose(),
  }
}
