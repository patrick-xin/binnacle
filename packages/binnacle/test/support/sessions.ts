/**
 * A stand-in for dsh's session persistence: stored sessions, each with its
 * header and its events, opened only to read.
 * @module binnacle/test/support/sessions
 */

/** One stored session: its id, when it was made, and its events. */
export interface Stored {
  readonly id: string
  readonly createdAt: number
  readonly events: readonly { readonly seq: number; readonly type: string; readonly time: number; readonly data: unknown }[]
}

export function persistence(stored: readonly Stored[]) {
  const opened: string[] = []
  return {
    opened,
    list: async () => stored.map(({ id, createdAt }) => ({ header: { id, createdAt }, revision: 0 })),
    open: async (id: string, access: string) => {
      if (access !== 'read') throw new Error(`opened ${id} to ${access}`)
      const session = stored.find((each) => each.id === id)
      if (session === undefined) throw new Error(`no session ${id}`)
      opened.push(id)
      return {
        read: async () => ({ eventState: 'detached', events: session.events }),
        close: async () => {},
      }
    },
  }
}
