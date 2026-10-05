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
