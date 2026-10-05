/**
 * The Read view: a stored session, drawn as its raw events. It lasts until
 * the transcript can draw a session.
 * @module binnacle/plugins/read
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'

export const name = 'binnacle-read'

export const inject = ['binnacle', 'sessionPersistence'] satisfies (keyof Context)[]

/**
 * The lines of each event: its seq and type, then its data as JSON, then a blank line.
 * @param events - the session's events, in order.
 * @returns the lines, top first.
 */
export function linesOf(events: readonly SessionEvent[]): string[] {
  return events.flatMap((event) => [`#${event.seq} ${event.type}`, ...JSON.stringify(event.data, null, 2).split('\n'), ''])
}

async function readSession(store: SessionPersistence, id: string): Promise<string[]> {
  const handle = await store.open(id as SessionId, 'read')
  try {
    return linesOf((await handle.read()).events)
  } finally {
    await handle.close()
  }
}

export function apply(ctx: Context): void {
  let lines: readonly string[] = []
  const shown = ctx.binnacle.show({ lines: () => lines })
  const id = ctx.binnacle.session
  if (id === undefined) return
  void readSession(ctx.sessionPersistence, id).then((read) => {
    lines = read
    shown.redraw()
  })
}
