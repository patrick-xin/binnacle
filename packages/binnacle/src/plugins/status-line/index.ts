import type { Context } from '@deepseek-ai/cordis'
import type { ChatSession, Layout } from '../../index.ts'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-status-line'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** The Look of a segment, by its Place's name: its value, plain already, drawn as one line. */
export type SegmentLook = (value: string) => string

const deepFrozen = <T extends object>(value: T): T => {
  for (const inner of Object.values(value)) if (typeof inner === 'object' && inner !== null) deepFrozen(inner)
  return Object.freeze(value)
}

/** The Layout `status`: the segments, joined by the theme's `divider`. Frozen, as an author builds on it. */
export const STATUS_LAYOUT: Layout & { readonly row: readonly Layout[] } = deepFrozen({
  row: [{ place: 'status.state' }, { place: 'status.model' }],
  separator: true,
})

const valuesOf = ({ id, agent }: ChatSession): { readonly [place: string]: string | undefined } =>
  agent === undefined
    ? { 'status.state': 'read only', 'status.model': id }
    : { 'status.state': agent.status, 'status.model': agent.options.model }

export function apply(plugin: Context): void {
  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  plugin.inject(['binnacleSession'], (ctx) => {
    const { binnacle } = ctx
    const chat = ctx.binnacleSession
    binnacle.layout('status', STATUS_LAYOUT)
    const segments = ['status.state', 'status.model'].map((place) =>
      binnacle.place(place, {
        lines: () => {
          const value = valuesOf(chat)[place]
          if (value === undefined) return []
          const look = binnacle.lookOf<SegmentLook>([place], (plain) => binnacle.paint('text', plain))
          return [look(toPlainText(value))]
        },
      }),
    )
    ctx.on('agent/status', ({ agent }) => {
      if (agent === chat.agent) for (const segment of segments) segment.redraw()
    })
  })
}
