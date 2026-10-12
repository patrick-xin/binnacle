import { afterEach } from 'node:test'
import { mount } from '../../src/testing/index.ts'
import type { MountOptions, Mounted } from '../../src/testing/index.ts'

let open: Mounted | undefined
afterEach(async () => {
  await open?.close()
  open = undefined
})

/** A mount of `binnacle/testing`, closed after each test, with the names that the built-ins' tests read it by. */
export async function mounted(options: MountOptions = {}) {
  await open?.close()
  const app = await mount(options)
  open = app
  const style = async (x: number, y: number) => {
    const { colour, bold, dim, italic, underline } = await app.style(x, y)
    return { colour, bold, dim, italic, underline }
  }
  // The calls of dsh's fake agent, by the names the tests read it by: each takes the Context as its first argument, as dsh's events are emitted on it.
  const dsh = {
    commit: (_ctx: unknown, event: { readonly seq?: number; readonly type: string; readonly time?: number; readonly data: unknown }) =>
      void app.agent.commit(event),
    stream: (_ctx: unknown, frame: unknown) => void app.agent.stream(frame as never),
    status: (_ctx: unknown, status: 'idle' | 'running') => void app.agent.status(status),
    agent: app.agent,
    get sent() {
      return app.agent.sent
    },
    get cancels() {
      return app.agent.cancels
    },
  }
  return {
    app,
    dsh,
    /** What unloads a row, as its fiber's `dispose` did. */
    row: (name: string) => ({ dispose: () => app.unload(name) }),
    ctx: app.ctx,
    clock: app.clock,
    exits: app.exits,
    terminal: {
      read: async () => ({ rows: await app.screen(), cursor: await app.cursor() }),
      type: (data: string) => void app.type(data),
      resize: (columns: number, rows: number) => void app.resize(columns, rows),
      styleAt: style,
      colourAt: async (x: number, y: number) => (await app.style(x, y)).colour,
      backgroundAt: async (x: number, y: number) => (await app.style(x, y)).background,
      inverseAt: async (x: number, y: number) => (await app.style(x, y)).inverse,
    },
  }
}
