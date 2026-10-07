import type { Context } from '@deepseek-ai/cordis'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Part } from '../../api.ts'
import { toPlainText } from '../../index.ts'

export const name = 'binnacle-transcript'

export const inject = ['binnacle'] satisfies (keyof Context)[]

// The Mark is the header line drawn in inverse video, which needs no theme.
const INVERSE = '\x1b[7m'
const RESET = '\x1b[0m'
const UNFOLDED = '▾'
const FOLDED = '▸'

/** A content block of the answer that streams, its deltas glued. */
interface Streamed {
  kind: string
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
    // The events the session committed, and what a person did with each: folded, or Marked.
    const events: SessionEvent[] = []
    const jsonOf = new Map<number, readonly string[]>()
    const folded = new Set<number>()
    let marked: number | undefined
    let hasFocus = false
    let hasHadFocus = false
    // The committed events' lines, then the live block's.
    const lines: string[] = []
    let committed = 0
    let live: Map<number, Streamed> | undefined
    const drawEvent = (event: SessionEvent): void => {
      const json = jsonOf.get(event.seq)!
      const isFolded = folded.has(event.seq)
      // A folded event's header line ends with how many of its lines it hides, counted before the core wraps them.
      const header = `${isFolded ? FOLDED : UNFOLDED} #${event.seq} ${toPlainText(event.type)}${isFolded ? ` (${json.length} lines)` : ''}`
      lines.push(marked === event.seq && hasFocus ? INVERSE + header + RESET : header)
      if (!isFolded) for (const line of json) lines.push(line)
      lines.push('')
    }
    const drawLive = (): void => {
      lines.length = committed
      if (live !== undefined) for (const line of liveLinesOf(live)) lines.push(line)
    }
    const rebuild = (): void => {
      lines.length = 0
      for (const event of events) drawEvent(event)
      committed = lines.length
      drawLive()
    }
    const add = (event: SessionEvent): void => {
      events.push(event)
      jsonOf.set(event.seq, JSON.stringify(event.data, null, 2).split('\n'))
      // With no event Marked, the first event that comes is, once the transcript has had the Focus.
      if (marked === undefined && (hasFocus || hasHadFocus)) marked = event.seq
      // An event is drawn where the last one ended, not from the start again: a session's events can be many.
      lines.length = committed
      drawEvent(event)
      committed = lines.length
      drawLive()
    }
    for (const event of chat.events) add(event)
    const spanOf = (event: SessionEvent): number => (folded.has(event.seq) ? 2 : jsonOf.get(event.seq)!.length + 2)
    const headerAt = (): number | undefined => {
      let at = 0
      for (const event of events) {
        if (event.seq === marked) return at
        at += spanOf(event)
      }
      return undefined
    }
    const eventAtHeader = (line: number): SessionEvent | undefined => {
      let at = 0
      for (const event of events) {
        if (line < at + spanOf(event)) return line === at ? event : undefined
        at += spanOf(event)
      }
      return undefined
    }
    const part: Part = {
      lines: () => lines,
      cursor: () => {
        const at = headerAt()
        return at === undefined ? undefined : { line: at, column: 0 }
      },
      focus: (has) => {
        hasFocus = has
        if (has) hasHadFocus = true
        // The newest event is Marked when the transcript first has the Focus, and no event is Marked yet.
        if (has && marked === undefined) marked = events.at(-1)?.seq
        rebuild()
      },
      key: (data) => {
        const actions = ctx.binnacle.gestures.actionsOf(data)
        const index = events.findIndex((event) => event.seq === marked)
        if (index === -1) return false
        if (actions.includes('tui.select.up') && index > 0) {
          marked = events[index - 1]!.seq
          rebuild()
          return true
        }
        if (actions.includes('tui.select.down') && index < events.length - 1) {
          marked = events[index + 1]!.seq
          rebuild()
          return true
        }
        if (actions.includes('tui.select.confirm')) {
          const seq = events[index]!.seq
          if (folded.has(seq)) folded.delete(seq)
          else folded.add(seq)
          rebuild()
          return true
        }
        return false
      },
      click: (at) => {
        const event = eventAtHeader(at.line)
        if (event === undefined) return false
        marked = event.seq
        if (folded.has(event.seq)) folded.delete(event.seq)
        else folded.add(event.seq)
        rebuild()
        return true
      },
    }
    const placed = ctx.binnacle.place('transcript', part)
    ctx.on('session/event', (session, event) => {
      if (session.header.id !== chat.id) return
      add(event)
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
      else if (chunk.type === 'tool-call-delta') {
        const block = glue(live, chunk.index, 'tool-call', chunk.argumentsDelta)
        // A provider sends the tool's name in the delta where it learns it, which may not be the first.
        if (chunk.name !== undefined) block.kind = `tool-call ${toPlainText(chunk.name)}`
      }
    }
    ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent !== chat.agent) return
      stream(frame)
      drawLive()
      placed.redraw()
    })
  })
}

function glue(blocks: Map<number, Streamed>, index: number, kind: string, text: string): Streamed {
  const block = blocks.get(index) ?? { kind, text: '' }
  block.text += text
  blocks.set(index, block)
  return block
}
