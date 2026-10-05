/**
 * The Read view: a stored session, drawn as its raw events. It lasts until
 * the transcript can draw a session.
 * @module binnacle/plugins/read
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionPersistence, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'

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

async function readSession(store: SessionPersistence, named: string | undefined): Promise<string[]> {
  const id = named ?? newest(await store.list())
  if (id === undefined) return ['No stored session to read.']
  const handle = await store.open(id as SessionId, 'read')
  try {
    return linesOf((await handle.read()).events)
  } finally {
    await handle.close()
  }
}

/**
 * The stored session made last.
 * @param stored - each stored session.
 * @returns its id, or none when nothing is stored.
 */
function newest(stored: readonly SessionPersistenceSnapshot[]): string | undefined {
  return stored.toSorted((a, b) => b.header.createdAt - a.header.createdAt)[0]?.header.id
}

export function apply(ctx: Context): void {
  let lines: readonly string[] = []
  const shown = ctx.binnacle.show({ lines: () => lines })
  void readSession(ctx.sessionPersistence, ctx.binnacle.session).then(
    (read) => {
      lines = read
      shown.redraw()
    },
    (error: unknown) => {
      lines = [`Could not read the session: ${error instanceof Error ? error.message : String(error)}`]
      shown.redraw()
    },
  )
}
