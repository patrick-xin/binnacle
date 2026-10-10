import type { Context } from '@deepseek-ai/cordis'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { gestureTable } from '../../core/gestures.ts'
import { createModel } from '../../core/model.ts'
import { toPlainText } from '../../index.ts'

export { failed, isPrompt, textOf, withoutReasoning } from './readers.ts'

export const name = 'binnacle-transcript'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** A content block of the answer that streams, its deltas glued. */
export interface LiveBlock {
  readonly kind: 'text' | 'reasoning' | 'tool-call'
  readonly text: string
  /** A tool call's name, once dsh gives it. */
  readonly name?: string
}

/** The state of the model `transcript`. The transcript sets `events` and `live`; set `folded` and `marked` to change what is drawn. */
export interface TranscriptState {
  /** The committed events, in order. */
  events: readonly SessionEvent[]
  /** The blocks of the answer that streams, in the answer's order, or `undefined` while none streams. */
  live: readonly LiveBlock[] | undefined
  /** The seqs of the folded events. */
  folded: number[]
  /** The seq of the Marked event. */
  marked: number | undefined
}

/** The Look `transcript.event.<type>`, beneath it `transcript.event`: an event's lines, given whether it is folded and the transcript's width. No line, and the event takes no row. */
export type EventLook = (event: SessionEvent, at: { folded: boolean; width: number }) => string[]

/** The Look `transcript.live`: the lines of the answer that streams, given its blocks and the transcript's width. */
export type LiveLook = (blocks: readonly LiveBlock[], width: number) => string[]

type Glued = { -readonly [key in keyof LiveBlock]: LiveBlock[key] }

const PLACE = 'transcript'

// The Mark is the first line drawn in inverse video, which needs no theme.
const INVERSE = '\x1b[7m'
const RESET = '\x1b[0m'
const UNFOLDED = '▾'
const FOLDED = '▸'

const liveLinesOf: LiveLook = (blocks) => {
  const lines = ['~ streaming']
  for (const { kind, text, name: tool } of blocks) {
    lines.push(tool === undefined ? kind : `${kind} ${toPlainText(tool)}`, ...text.split('\n').map(toPlainText))
  }
  return lines
}

// A Look's own style sequence can end the inverse video part of the way along the line, as a reset does in any of its forms, so it is set again after each.
const inverse = (line: string): string => INVERSE + line.replace(/\x1b\[[0-9;:]*m/g, (style) => style + INVERSE) + RESET

/** Where the Mark is drawn: on the Marked event if it draws, else the next that draws, else the one before. */
function markedIn(drawing: readonly number[], marked: number | undefined): number | undefined {
  if (marked === undefined) return undefined
  return drawing.find((seq) => seq >= marked) ?? drawing.findLast((seq) => seq < marked)
}

interface Drawn {
  readonly width: number
  readonly lines: readonly string[]
  /** The seqs of the events that draw, in order. */
  readonly drawing: readonly number[]
  readonly firstOf: ReadonlyMap<number, number>
  readonly seqAt: ReadonlyMap<number, number>
  readonly mark: number | undefined
}

export function apply(plugin: Context): void {
  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  plugin.inject(['binnacleSession'], (ctx) => {
    const { binnacle } = ctx
    const chat = ctx.binnacleSession
    const model = createModel<TranscriptState>({ events: [], live: undefined, folded: [], marked: undefined })
    // The transcript's own, so that an author who sets `events` or `live` has them replaced at the next event or frame.
    const events: SessionEvent[] = []
    let live: Map<number, Glued> | undefined
    const jsonOf = new WeakMap<SessionEvent, string[]>()
    let hasFocus = false
    let hasHadFocus = false

    const ownLive = (): LiveBlock[] | undefined =>
      live && [...live].toSorted(([a], [b]) => a - b).map(([, block]): LiveBlock => ({ ...block }))
    const add = (event: SessionEvent): void => {
      events.push(event)
      jsonOf.set(event, JSON.stringify(event.data, null, 2).split('\n'))
      const blocks = ownLive()
      model.set((state) => {
        state.events = events
        state.live = blocks
        // With no event Marked, the first event that comes is, once the transcript has had the Focus.
        if (state.marked === undefined && (hasFocus || hasHadFocus)) state.marked = event.seq
      })
    }
    for (const event of chat.events) add(event)

    const eventLines: EventLook = (event, { folded }) => {
      const json = jsonOf.get(event) ?? JSON.stringify(event.data, null, 2).split('\n')
      // A folded event's header line ends with how many of its lines it hides, counted before the core wraps them.
      const header = `${folded ? FOLDED : UNFOLDED} #${event.seq} ${toPlainText(event.type)}${folded ? ` (${json.length} lines)` : ''}`
      return folded ? [header, ''] : [header, ...json, '']
    }

    // Each Look is called at each draw, so that the lines follow the theme, the Looks and their models. The last drawn is kept for a click, which lands on what was drawn.
    let drawn: Drawn | undefined
    const draw = (width: number): Drawn => {
      const { events: shown, live: blocks, folded, marked } = model.state
      const lines: string[] = []
      const drawing: number[] = []
      const firstOf = new Map<number, number>()
      const seqAt = new Map<number, number>()
      for (const event of shown) {
        const look = binnacle.lookOf<EventLook>([`transcript.event.${event.type}`, 'transcript.event'], eventLines)
        const own = look(event, { folded: folded.includes(event.seq), width })
        if (own.length === 0) continue
        drawing.push(event.seq)
        firstOf.set(event.seq, lines.length)
        seqAt.set(lines.length, event.seq)
        lines.push(...own)
      }
      const mark = markedIn(drawing, marked)
      const at = mark === undefined ? undefined : firstOf.get(mark)
      if (hasFocus && at !== undefined) lines[at] = inverse(lines[at] ?? '')
      if (blocks !== undefined) lines.push(...binnacle.lookOf<LiveLook>(['transcript.live'], liveLinesOf)(blocks, width))
      drawn = { width, lines, drawing, firstOf, seqAt, mark }
      return drawn
    }
    const again = (): Drawn => draw(drawn?.width ?? 0)

    const mark = (seq: number): void => model.set((state) => (state.marked = seq))
    const fold = (seq: number): void =>
      model.set((state) => {
        const at = state.folded.indexOf(seq)
        if (at === -1) state.folded.push(seq)
        else state.folded.splice(at, 1)
      })
    // Up and down move from where the Mark is drawn, among the events that draw.
    const step = (by: -1 | 1): void => {
      const { drawing, mark: at } = again()
      const to = at === undefined ? undefined : drawing[drawing.indexOf(at) + by]
      if (to !== undefined) mark(to)
    }

    binnacle.model(PLACE, model)
    binnacle.action('transcript.up', {
      keys: gestureTable.getKeys('tui.select.up'),
      place: PLACE,
      description: 'Mark the event above',
      run: () => step(-1),
    })
    binnacle.action('transcript.down', {
      keys: gestureTable.getKeys('tui.select.down'),
      place: PLACE,
      description: 'Mark the event below',
      run: () => step(1),
    })
    binnacle.action('transcript.fold', {
      keys: gestureTable.getKeys('tui.select.confirm'),
      place: PLACE,
      description: 'Fold or unfold the Marked event',
      run: () => {
        // The event where the Mark is drawn, which a person sees Marked.
        const { mark: at } = again()
        if (at !== undefined) fold(at)
      },
    })
    binnacle.action('transcript.click', {
      keys: ['click'],
      place: PLACE,
      description: 'Fold or unfold the event whose header is clicked, and Mark it',
      run: (at) => {
        const seq = at === undefined ? undefined : (drawn ?? again()).seqAt.get(at.line)
        if (seq === undefined) return
        mark(seq)
        fold(seq)
      },
    })

    binnacle.place(PLACE, {
      models: [model],
      lines: (width) => draw(width).lines,
      cursor: (width) => {
        const { mark: at, firstOf } = draw(width)
        const line = at === undefined ? undefined : firstOf.get(at)
        return line === undefined ? undefined : { line, column: 0 }
      },
      focus: (has) => {
        hasFocus = has
        if (has) hasHadFocus = true
        // The newest event is Marked when the transcript first has the Focus, and no event is Marked yet.
        const newest = model.state.events.at(-1)
        if (has && model.state.marked === undefined && newest !== undefined) mark(newest.seq)
      },
    })
    ctx.on('session/event', (session, event) => {
      if (session.header.id === chat.id) add(event)
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
        if (chunk.name !== undefined) block.name = chunk.name
      }
    }
    ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent !== chat.agent) return
      stream(frame)
      const blocks = ownLive()
      model.set((state) => {
        state.events = events
        state.live = blocks
      })
    })
  })
}

function glue(blocks: Map<number, Glued>, index: number, kind: LiveBlock['kind'], text: string): Glued {
  const block = blocks.get(index) ?? { kind, text: '' }
  block.text += text
  blocks.set(index, block)
  return block
}
