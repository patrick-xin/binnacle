import type { Context } from '@deepseek-ai/cordis'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { gestureTable } from '../../core/gestures.ts'
import { createModel } from '../../core/model.ts'
import { toPlainText } from '../../index.ts'

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

type Glued = { -readonly [key in keyof LiveBlock]: LiveBlock[key] }

const PLACE = 'transcript'

// The Mark is the header line drawn in inverse video, which needs no theme.
const INVERSE = '\x1b[7m'
const RESET = '\x1b[0m'
const UNFOLDED = '▾'
const FOLDED = '▸'

function liveLinesOf(blocks: readonly LiveBlock[]): string[] {
  const lines = ['~ streaming']
  for (const { kind, text, name: tool } of blocks) {
    lines.push(tool === undefined ? kind : `${kind} ${toPlainText(tool)}`, ...text.split('\n').map(toPlainText))
  }
  return lines
}

interface Drawn {
  readonly key: string
  readonly events: readonly SessionEvent[]
  readonly lines: readonly string[]
  readonly headerOf: ReadonlyMap<number, number>
  readonly seqAt: ReadonlyMap<number, number>
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
    const jsonOf = new Map<number, readonly string[]>()
    let hasFocus = false
    let hasHadFocus = false

    const ownLive = (): LiveBlock[] | undefined =>
      live && [...live].toSorted(([a], [b]) => a - b).map(([, block]): LiveBlock => ({ ...block }))
    const add = (event: SessionEvent): void => {
      events.push(event)
      jsonOf.set(event.seq, JSON.stringify(event.data, null, 2).split('\n'))
      const blocks = ownLive()
      model.set((state) => {
        state.events = events
        state.live = blocks
        // With no event Marked, the first event that comes is, once the transcript has had the Focus.
        if (state.marked === undefined && (hasFocus || hasHadFocus)) state.marked = event.seq
      })
    }
    for (const event of chat.events) add(event)

    // The committed events' lines are built again only when what they show changes, not at each frame of the live block.
    let drawn: Drawn | undefined
    const committed = (): Drawn => {
      const { events: shown, folded, marked } = model.state
      const key = `${shown.length}|${folded.join(',')}|${marked}|${hasFocus}`
      if (drawn?.events === shown && drawn.key === key) return drawn
      const lines: string[] = []
      const headerOf = new Map<number, number>()
      const seqAt = new Map<number, number>()
      for (const event of shown) {
        const json = jsonOf.get(event.seq) ?? JSON.stringify(event.data, null, 2).split('\n')
        const isFolded = folded.includes(event.seq)
        // A folded event's header line ends with how many of its lines it hides, counted before the core wraps them.
        const header = `${isFolded ? FOLDED : UNFOLDED} #${event.seq} ${toPlainText(event.type)}${isFolded ? ` (${json.length} lines)` : ''}`
        headerOf.set(event.seq, lines.length)
        seqAt.set(lines.length, event.seq)
        lines.push(marked === event.seq && hasFocus ? INVERSE + header + RESET : header)
        if (!isFolded) lines.push(...json)
        lines.push('')
      }
      drawn = { key, events: shown, lines, headerOf, seqAt }
      return drawn
    }

    const mark = (seq: number): void => model.set((state) => (state.marked = seq))
    const fold = (seq: number): void =>
      model.set((state) => {
        const at = state.folded.indexOf(seq)
        if (at === -1) state.folded.push(seq)
        else state.folded.splice(at, 1)
      })
    const step = (by: -1 | 1): void => {
      const { events: shown, marked } = model.state
      const index = shown.findIndex((event) => event.seq === marked)
      const to = shown[index + by]
      if (index !== -1 && to !== undefined) mark(to.seq)
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
        const { events: shown, marked } = model.state
        if (marked !== undefined && shown.some((event) => event.seq === marked)) fold(marked)
      },
    })
    binnacle.action('transcript.click', {
      keys: ['click'],
      place: PLACE,
      description: 'Fold or unfold the event whose header is clicked, and Mark it',
      run: (at) => {
        const seq = at === undefined ? undefined : committed().seqAt.get(at.line)
        if (seq === undefined) return
        mark(seq)
        fold(seq)
      },
    })

    binnacle.place(PLACE, {
      models: [model],
      lines: () => {
        const { lines } = committed()
        const blocks = model.state.live
        return blocks === undefined ? lines : [...lines, ...liveLinesOf(blocks)]
      },
      cursor: () => {
        const { marked } = model.state
        const at = marked === undefined ? undefined : committed().headerOf.get(marked)
        return at === undefined ? undefined : { line: at, column: 0 }
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
