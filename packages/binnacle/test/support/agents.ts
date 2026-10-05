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
  let session: { header: { id: string } } | undefined
  const agent = {
    status: 'idle' as 'idle' | 'running',
    get session() {
      return session
    },
    followup: (message: Parameters<typeof textOf>[0]) => sent.push({ how: 'followup', text: textOf(message) }),
    steer: (message: Parameters<typeof textOf>[0]) => sent.push({ how: 'steer', text: textOf(message) }),
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
  return { created, sent, agent, provide }
}
