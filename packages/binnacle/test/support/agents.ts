import type { Context } from '@deepseek-ai/cordis'

export const SELECTION = { provider: 'deepseek', model: 'deepseek-v4' }

interface Sent {
  readonly how: 'followup' | 'steer'
  readonly text: string
}

function textOf(message: { content: readonly { type: string; text?: string }[] }): string {
  return message.content.map((block) => block.text ?? '').join('')
}

// dsh's agent registry and default model, as dsh-base provides them, with one agent that records what it is sent.
export function agents() {
  const created: { sessionId: string; meta: unknown; agentOptions: unknown }[] = []
  const sent: Sent[] = []
  const cancels: unknown[] = []
  let session: { header: { id: string } } | undefined
  const agent = {
    options: SELECTION,
    status: 'idle' as 'idle' | 'running',
    get session() {
      return session
    },
    followup: (message: Parameters<typeof textOf>[0]) => sent.push({ how: 'followup', text: textOf(message) }),
    steer: (message: Parameters<typeof textOf>[0]) => sent.push({ how: 'steer', text: textOf(message) }),
    cancel: (cause: unknown, options?: unknown) => cancels.push({ cause, options }),
  }
  const provide = (ctx: Context): void => {
    ctx.provide('agentDefaultModel', { currentSelection: () => SELECTION })
    ctx.provide('agents', {
      create: async (options: { sessionId: string; meta: unknown; agentOptions: unknown }) => {
        created.push({ sessionId: options.sessionId, meta: options.meta, agentOptions: options.agentOptions })
        session = { header: { id: options.sessionId } }
        return { agent }
      },
    })
  }
  // dsh emits each event its session commits, and each frame of the answer that streams, on the Context.
  const commit = (ctx: Context, event: { seq: number; type: string; time: number; data: unknown }): void => {
    ctx.emit('session/event', session as never, event as never)
  }
  const stream = (ctx: Context, frame: unknown): void => {
    ctx.emit('agent/assistant-stream', { agent, frame } as never)
  }
  const status = (ctx: Context, now: 'idle' | 'running'): void => {
    agent.status = now
    ctx.emit('agent/status', { agent, status: now } as never)
  }
  return { created, sent, cancels, agent, provide, commit, stream, status }
}
