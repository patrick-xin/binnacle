import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Model, TurnState } from '../api.ts'
import { internals } from './internals.ts'
import { createModel } from './model.ts'

/** The start of the newest turn in the events that has not ended, or none. */
function openTurnIn(events: readonly SessionEvent[]): number | undefined {
  const boundary = events.findLast(({ type }) => type === 'turn/start' || type === 'turn/end')
  return boundary?.type === 'turn/start' ? boundary.time : undefined
}

/**
 * The model `turn`: when the turn that runs started. dsh's `turn/start` gives it, so a queued turn, which starts while the agent runs, sets it again.
 * The agent's status gives it until the turn's own event comes, and takes it away when the agent stops running.
 */
export function startTurn(ctx: Context): Model<TurnState> {
  const turn = createModel<{ startedAt: number | undefined }>({ startedAt: undefined })
  const start = (startedAt: number | undefined): void => {
    if (turn.state.startedAt !== startedAt) turn.set((state) => (state.startedAt = startedAt))
  }
  // The session opens after dsh's plugins settle, and a stored one has no agent, so no turn runs on it.
  ctx.inject(['binnacleSession'], (opened) => {
    const chat = opened.binnacleSession
    const agent = chat.agent
    if (agent === undefined) return
    if (agent.status === 'running') start(openTurnIn(chat.events) ?? internals.now())
    opened.on('session/event', (session, event) => {
      if (session.header.id === chat.id && event.type === 'turn/start') start(event.time)
    })
    opened.on('agent/status', ({ agent: changed, status }) => {
      if (changed !== agent) return
      if (status !== 'running') start(undefined)
      else if (turn.state.startedAt === undefined) start(internals.now())
    })
  })
  return { state: turn.state, watch: turn.watch, set: () => {} }
}
