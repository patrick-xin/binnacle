import type { Context } from '@deepseek-ai/cordis'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-transcript'

export const inject = ['binnacle'] satisfies (keyof Context)[]

function linesOf(event: SessionEvent): string[] {
  return [`#${event.seq} ${toPlainText(event.type)}`, ...JSON.stringify(event.data, null, 2).split('\n'), '']
}

/** A content block of the answer that streams, its deltas glued. */
interface Streamed {
  readonly kind: string
  text: string
}

function liveLinesOf(blocks: ReadonlyMap<number, Streamed>): string[] {
  const lines = ['~ streaming']
  for (const [, { kind, text }] of [...blocks].toSorted(([a], [b]) => a - b)) lines.push(kind, ...text.split('\n').map(toPlainText))
  return lines
}

export function apply(plugin: Context): void {
  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  plugin.inject(['binnacleSession'], (ctx) => {
    const chat = ctx.binnacleSession
    // The committed events' lines, then the live block's.
    const lines: string[] = []
    let committed = 0
    let live: Map<number, Streamed> | undefined
    // A session's events can be many; a spread into one call throws past about a hundred thousand.
    const add = (event: SessionEvent): void => {
      lines.length = committed
      for (const line of linesOf(event)) lines.push(line)
      committed = lines.length
    }
    const drawLive = (): void => {
      lines.length = committed
      if (live !== undefined) for (const line of liveLinesOf(live)) lines.push(line)
    }
    for (const event of chat.events) add(event)
    const placed = ctx.binnacle.place('transcript', { lines: () => lines })
    ctx.on('session/event', (session, event) => {
      if (session.header.id !== chat.id) return
      add(event)
      drawLive()
      placed.redraw()
    })
    const stream = (frame: AssistantStreamFrame): void => {
      if (frame.type === 'start') live = new Map()
      // dsh commits the answer's event before it ends the stream, so the event is drawn already.
      if (frame.type === 'end') live = undefined
      if (frame.type !== 'chunk' || live === undefined) return
      const { chunk } = frame
      if (chunk.type === 'reasoning-delta') glue(live, chunk.index, 'reasoning', chunk.text)
      else if (chunk.type === 'text-delta') glue(live, chunk.index, 'text', chunk.text)
      else if (chunk.type === 'tool-call-delta')
        glue(live, chunk.index, `tool-call ${toPlainText(chunk.name ?? '')}`.trimEnd(), chunk.argumentsDelta)
    }
    ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent !== chat.agent) return
      stream(frame)
      drawLive()
      placed.redraw()
    })
  })
}

function glue(blocks: Map<number, Streamed>, index: number, kind: string, text: string): void {
  const block = blocks.get(index)
  if (block === undefined) blocks.set(index, { kind, text })
  else block.text += text
}
