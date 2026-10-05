import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ChatSession } from '../api.ts'
// Each empty type import merges a dsh service into Cordis's Context, and loads nothing.
// oxlint-disable import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/cordis-plugin-loader'
// oxlint-enable import/no-empty-named-blocks, unicorn/require-module-specifiers

// A stored session is read once, and nothing is sent to it.
export async function openStored(ctx: Context, id: string): Promise<ChatSession | undefined> {
  await ctx.get('loader')?.await()
  const store = ctx.get('sessionPersistence')
  if (store === undefined) return undefined
  const handle = await store.open(id as SessionId, 'read')
  try {
    const { events } = await handle.read()
    return { id, agent: undefined, events, send: () => {}, interrupt: () => {} }
  } finally {
    await handle.close()
  }
}

// As dsh's headless bundle opens one: on dsh-base, with no preset, on the default model.
export async function openNew(ctx: Context): Promise<ChatSession | undefined> {
  // The loader mounts its plugins together; an agent made before they settle would miss their tools.
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  if (agents === undefined || defaultModel === undefined) return undefined
  const selection = defaultModel.currentSelection()
  const fs = ctx.get('fs')
  const cwd = fs === undefined ? process.cwd() : fs.processPath(await fs.resolve('.'))
  const id = `session-${randomUUID()}`
  const events: SessionEvent[] = []
  // The session commits its first events while it is made, before the agent is returned.
  ctx.on('session/event', (session, event) => {
    if (session.header.id === id) events.push(event)
  })
  const { agent } = await agents.create({
    sessionId: id as SessionId,
    meta: { cwd },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
    },
  })
  return {
    id,
    agent,
    events,
    send: (text) => {
      const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      if (agent.status === 'running') agent.steer(message)
      else agent.followup(message)
    },
    interrupt: () => {
      agent.cancel({ kind: 'user' })
    },
  }
}

/** Opens the Chat's session, and provides it once it is open; a session that cannot open is said, with why. */
export function openChat(ctx: Context, named: string | undefined, failed: (why: string) => void): void {
  void (named === undefined ? openNew(ctx) : openStored(ctx, named)).then(
    (session) => {
      // A service provided with no value is still there for Cordis, so it is provided once the session is open.
      if (session !== undefined) ctx.provide('binnacleSession', session)
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      failed(`could not ${named === undefined ? 'open a session' : `read ${named}`}: ${message}`)
    },
  )
}
