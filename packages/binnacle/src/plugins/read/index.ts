import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionPersistence, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-read'

export const inject = ['binnacle', 'sessionPersistence'] satisfies (keyof Context)[]

function linesOf(events: readonly SessionEvent[]): string[] {
  return events.flatMap((event) => [`#${event.seq} ${toPlainText(event.type)}`, ...JSON.stringify(event.data, null, 2).split('\n'), ''])
}

function newestSessionId(stored: readonly SessionPersistenceSnapshot[]): string | undefined {
  return stored.toSorted((a, b) => b.header.createdAt - a.header.createdAt)[0]?.header.id
}

async function readSession(store: SessionPersistence, named: string | undefined): Promise<string[]> {
  const id = named ?? newestSessionId(await store.list())
  if (id === undefined) return ['No stored session to read.']
  const handle = await store.open(id as SessionId, 'read')
  try {
    return linesOf((await handle.read()).events)
  } finally {
    await handle.close()
  }
}

export function apply(ctx: Context): void {
  let lines: readonly string[] = []
  const placed = ctx.binnacle.place('transcript', { lines: () => lines })
  void readSession(ctx.sessionPersistence, ctx.binnacle.session).then(
    (read) => {
      lines = read
      placed.redraw()
    },
    (error: unknown) => {
      lines = [`Could not read the session: ${error instanceof Error ? error.message : String(error)}`]
      placed.redraw()
    },
  )
}
