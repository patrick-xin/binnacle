import type { Context } from '@deepseek-ai/cordis'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createModel, toPlainText } from '../../index.ts'
import type { Point } from '../../index.ts'

export { callOf, failed, isPrompt, noticeOf, producerOf, reasoningOf, textOf, withoutReasoning } from './readers.ts'
export type { Call, Notice } from './readers.ts'

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
  /** The folded regions: an event's own, its seq as a string such as `'12'`, or a part of it, such as `'12/body'`. */
  folded: string[]
  /** The seq of the Marked event. */
  marked: number | undefined
}

/**
 * A line that a transcript Look returns: a string, or its `text` with what a click on it does.
 * A click on a line with `fold` folds that region, and on a line with `run` runs that action, given the cell clicked. A line with both runs its action.
 * Either acts only at the column `from` of its text and after it, 0 by default: a click before it Marks the event alone.
 */
export type Line = string | { readonly text: string; readonly fold?: string; readonly run?: string; readonly from?: number }

/** What an event's Look is given beside the event. */
export interface EventAt {
  /** Whether the event's own region is folded. */
  readonly folded: boolean
  /** Whether a region is folded, such as `'12/body'`. */
  readonly isFolded: (region: string) => boolean
  readonly width: number
}

/** The Look `transcript.event.<type>`, beneath it `transcript.event`: an event's lines, given whether it is folded and the transcript's width. No line, and the event takes no row. */
export type EventLook = (event: SessionEvent, at: EventAt) => Line[]

/** The Look `transcript.live`: the lines of the answer that streams, given its blocks and the transcript's width. */
export type LiveLook = (blocks: readonly LiveBlock[], width: number) => Line[]

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

type Acting = Exclude<Line, string>

interface Drawn {
  readonly width: number
  readonly lines: readonly string[]
  /** The seqs of the events that draw, in order. */
  readonly drawing: readonly number[]
  readonly firstOf: ReadonlyMap<number, number>
  /** The seq of the event that drew each line, by its index; none for the live block's. */
  readonly ownerAt: ReadonlyMap<number, number>
  /** What a click does on each line that says, by its index. */
  readonly actingAt: ReadonlyMap<number, Acting>
  /** The first region that each event marks on a line it draws. */
  readonly firstFoldOf: ReadonlyMap<number, string>
  readonly mark: number | undefined
}

const regionOf = (seq: number): string => String(seq)

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
      // dsh commits the answer before it ends the stream, so the answer would draw twice until the end.
      if (event.type === 'assistant/message' || event.type === 'assistant/attempt') live = undefined
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
      const ownerAt = new Map<number, number>()
      const actingAt = new Map<number, Acting>()
      const firstFoldOf = new Map<number, string>()
      const isFolded = (region: string): boolean => folded.includes(region)
      const push = (own: readonly Line[], seq: number | undefined): void => {
        for (const line of own) {
          if (seq !== undefined) ownerAt.set(lines.length, seq)
          if (typeof line === 'string') {
            lines.push(line)
            continue
          }
          if (line.fold !== undefined && seq !== undefined && !firstFoldOf.has(seq)) firstFoldOf.set(seq, line.fold)
          actingAt.set(lines.length, line)
          lines.push(line.text)
        }
      }
      for (const event of shown) {
        const look = binnacle.lookOf<EventLook>([`transcript.event.${event.type}`, 'transcript.event'], eventLines)
        const own = look(event, { folded: isFolded(regionOf(event.seq)), isFolded, width })
        if (own.length === 0) continue
        drawing.push(event.seq)
        firstOf.set(event.seq, lines.length)
        push(own, event.seq)
      }
      const mark = markedIn(drawing, marked)
      const at = mark === undefined ? undefined : firstOf.get(mark)
      if (hasFocus && at !== undefined) lines[at] = inverse(lines[at] ?? '')
      if (blocks !== undefined) push(binnacle.lookOf<LiveLook>(['transcript.live'], liveLinesOf)(blocks, width), undefined)
      drawn = { width, lines, drawing, firstOf, ownerAt, actingAt, firstFoldOf, mark }
      return drawn
    }
    const again = (): Drawn => draw(drawn?.width ?? 0)

    const mark = (seq: number): void => model.set((state) => (state.marked = seq))
    const fold = (region: string): void =>
      model.set((state) => {
        const at = state.folded.indexOf(region)
        if (at === -1) state.folded.push(region)
        else state.folded.splice(at, 1)
      })
    // A line acts only from its `from`. Before it, a click is on the line as on a plain one that is not its event's first, so it Marks alone.
    const actingAtCell = ({ line, column }: Point): Acting | undefined => {
      const acting = (drawn ?? again()).actingAt.get(line)
      return acting !== undefined && column >= (acting.from ?? 0) ? acting : undefined
    }
    // A plain first line folds its event so that a Look that returns strings folds as it did before lines could act; another plain line folds nothing.
    const regionAt = (at: Point): string | undefined => {
      const { actingAt, ownerAt, firstOf } = drawn ?? again()
      if (actingAt.has(at.line)) return actingAtCell(at)?.fold
      const seq = ownerAt.get(at.line)
      return seq !== undefined && firstOf.get(seq) === at.line ? regionOf(seq) : undefined
    }
    // Up and down move from where the Mark is drawn, among the events that draw.
    const step = (by: -1 | 1): void => {
      const { drawing, mark: at } = again()
      const to = at === undefined ? undefined : drawing[drawing.indexOf(at) + by]
      if (to !== undefined) mark(to)
    }

    binnacle.model(PLACE, model)
    binnacle.action('transcript.up', {
      keys: binnacle.keysOf('tui.select.up'),
      place: PLACE,
      description: 'Mark the event above',
      run: () => step(-1),
    })
    binnacle.action('transcript.down', {
      keys: binnacle.keysOf('tui.select.down'),
      place: PLACE,
      description: 'Mark the event below',
      run: () => step(1),
    })
    binnacle.action('transcript.fold', {
      keys: binnacle.keysOf('tui.select.confirm'),
      place: PLACE,
      description: 'Fold or unfold the Marked event, or the region of the line clicked',
      run: (at) => {
        if (at !== undefined) {
          const region = regionAt(at)
          if (region !== undefined) fold(region)
          return
        }
        // The event where the Mark is drawn, which a person sees Marked.
        const { mark: seq, firstFoldOf } = again()
        if (seq !== undefined) fold(firstFoldOf.get(seq) ?? regionOf(seq))
      },
    })
    binnacle.action('transcript.click', {
      keys: ['click'],
      place: PLACE,
      description: 'Mark the event clicked, then run the action of the line clicked, or else fold what it marks',
      run: (at) => {
        if (at === undefined) return
        const seq = (drawn ?? again()).ownerAt.get(at.line)
        const run = actingAtCell(at)?.run
        if (seq !== undefined) mark(seq)
        binnacle.run(run ?? 'transcript.fold', at)
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
