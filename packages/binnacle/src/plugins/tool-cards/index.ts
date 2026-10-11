import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallView, ToolDefinition, ToolResultView } from '@deepseek-ai/dsh-tools'
import { toPlainText, truncateToWidth, visibleWidth } from '../../index.ts'
import type { Tone } from '../../index.ts'
import { callOf, failed, textOf } from '../transcript/index.ts'
import type { EventLook, Line, TranscriptState } from '../transcript/index.ts'

export type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'

export const name = 'binnacle-tool-cards'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** A tool call and its result, as `transcript.card` is given them. Text in `call` and `result` is Untrusted Text. */
export interface Card {
  readonly seq: number
  readonly name: string
  /** The arguments, parsed, or the raw string when they are not JSON. */
  readonly args: unknown
  /** dsh's view of the call, from the tool's `presentCall`, or `undefined` when the tool gives none. */
  readonly call: ToolCallView | undefined
  /**
   * The result, once it came: dsh's view of it from the tool's `presentResult`, its text, and whether it failed.
   * It failed when dsh's `isError` is true, or when a terminal view has a signal or an exit code other than 0.
   */
  readonly result: { readonly view: ToolResultView | undefined; readonly text: string; readonly failed: boolean } | undefined
  /** The call's time, in epoch milliseconds. */
  readonly startedAt: number
  /** The result's time, or `undefined` while the call runs. */
  readonly endedAt: number | undefined
}

/** What `transcript.card` is given beside the card. */
export interface CardAt {
  readonly width: number
  /** Whether a region is folded, such as the card's body, `'<seq>/body'`. */
  readonly isFolded: (region: string) => boolean
}

/** The Look `transcript.card`: a card's lines. */
export type CardLook = (card: Card, at: CardAt) => Line[]

/** The Look `transcript.card.title`: the text of a card's first line, without its time, given the width left beside the time. */
export type CardTitleLook = (card: Card, width: number) => string

/** The Look `transcript.card.time`: the text of how long the call took, or `''` for none. */
export type CardTimeLook = (card: Card) => string

/** The Look `transcript.card.mark`: a card's painted dot, which the default title draws before the title. */
export type CardMarkLook = (card: Card) => string

/** The Look `transcript.card.most`: how many lines a terminal, web, generic or no-view body shows at most. */
export type CardMostLook = (card: Card) => number

/** The Looks `transcript.tool.<name>` and `transcript.card.<kind>`: a card's body lines, without the `⎿` prefix, given the body's width. */
export type CardBodyLook = (card: Card, width: number) => string[]

const FIRST = '  ⎿ '
const REST = '    '

type Fields = Readonly<Record<string, unknown>>

const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : undefined

const oneLine = (text: string): string => toPlainText(text.replace(/\s*[\r\n]+\s*/g, ' '))

const linesOf = (text: string): string[] => {
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

const textBlocks = (content: unknown): string | undefined => {
  if (!Array.isArray(content)) return undefined
  const texts = content.flatMap((block) => {
    const { type, text } = fields(block) ?? {}
    return type === 'text' && typeof text === 'string' ? [text] : []
  })
  return texts.length === 0 ? undefined : texts.join('')
}

const counts = (oldText: string | null, newText: string): { added: number; removed: number } => {
  const before = oldText === null ? [] : linesOf(oldText)
  const after = linesOf(newText)
  const had = new Set(before)
  const has = new Set(after)
  return { added: after.filter((line) => !had.has(line)).length, removed: before.filter((line) => !has.has(line)).length }
}

// A presenter is a tool's own code, and a tool that throws must not stop the transcript from drawing.
const safely = <T>(present: () => T): T | undefined => {
  try {
    return present()
  } catch {
    return undefined
  }
}

const parse = (args: string): { readonly args: unknown; readonly parsed: boolean } => {
  try {
    return { args: JSON.parse(args) as unknown, parsed: true }
  } catch {
    return { args, parsed: false }
  }
}

// dsh's shell gives `isError` false for a command that exits 1, and a person reads that as a failure.
const shellFailed = (view: ToolResultView | undefined): boolean =>
  view?.card === 'terminal' && ((typeof view.exitCode === 'number' && view.exitCode !== 0) || view.signal !== undefined)

const most: CardMostLook = () => 12

const time: CardTimeLook = ({ startedAt, endedAt }) => {
  if (endedAt === undefined) return ''
  const took = Math.max(0, endedAt - startedAt)
  if (took < 60_000) return `${(took / 1000).toFixed(1)}s`
  const seconds = Math.floor(took / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function apply(ctx: Context): void {
  const { binnacle } = ctx
  const transcript = binnacle.modelOf<TranscriptState>('transcript')
  const paint = (tone: Tone, text: string): string => binnacle.paint(tone, text)
  const cut = (text: string, width: number): string => truncateToWidth(text, Math.max(0, width), binnacle.tokens.glyphs.more)
  const first = (card: Card, text: string, width: number): string[] =>
    linesOf(text)
      .slice(0, Math.max(0, pieces.most()(card)))
      .map((line) => cut(toPlainText(line), width))
  const titled = (title: string | undefined, width: number): string[] => (title === undefined ? [] : [cut(oneLine(title), width)])

  const mark: CardMarkLook = (card) => paint(card.result === undefined ? 'accent' : card.result.failed ? 'error' : 'success', '⏺')
  const title: CardTitleLook = (card, width) => {
    const dot = pieces.mark()(card)
    return `${dot} ${cut(oneLine(card.call?.title ?? card.name), width - visibleWidth(dot) - 1)}`
  }
  // The raw arguments of each card the row makes, as parsing and serializing them again can change them, such as a number's digits.
  const raws = new WeakMap<Card, string>()
  const generic: CardBodyLook = (card, width) => {
    const { args, call, result } = card
    if (result !== undefined) {
      const view = result.view?.card === 'generic' ? result.view : undefined
      return [...titled(view?.title, width), ...first(card, textBlocks(view?.content) ?? result.text, width)]
    }
    if (call === undefined) return [cut(oneLine(raws.get(card) ?? (typeof args === 'string' ? args : JSON.stringify(args))), width)]
    if (call.card !== 'generic' || call.rawInput === undefined) return []
    return [cut(oneLine(JSON.stringify(call.rawInput) ?? ''), width)]
  }
  const terminal: CardBodyLook = (card, width) => {
    const { call, result } = card
    if (result === undefined) {
      if (call?.card !== 'terminal') return generic(card, width)
      return [call.description, call.cwd].flatMap((text) => (text === undefined ? [] : [cut(oneLine(text), width)]))
    }
    if (result.view?.card !== 'terminal') return generic(card, width)
    const { output, exitCode, signal } = result.view
    const lines = linesOf(output ?? '')
    const shown = Math.max(0, pieces.most()(card))
    const earlier = lines.length - shown
    const status =
      signal !== undefined ? `signal ${oneLine(signal)}` : exitCode !== undefined && exitCode !== 0 ? `exit ${exitCode}` : undefined
    return [
      ...(earlier > 0 ? [paint('muted', `${binnacle.tokens.glyphs.more} ${earlier} earlier lines`)] : []),
      ...lines.slice(Math.max(0, earlier)).map((line) => cut(toPlainText(line), width)),
      ...(status === undefined ? [] : [paint('error', cut(status, width))]),
    ]
  }
  const diff: CardBodyLook = (card, width) => {
    const view = card.result === undefined ? card.call : card.result.view
    if (view?.card !== 'diff') return generic(card, width)
    return view.diffs.map(({ path, oldText, newText }) => {
      const { added, removed } = counts(oldText, newText)
      const tail = ` +${added} -${removed}`
      return `${cut(oneLine(path), width - visibleWidth(tail))} ${paint('success', `+${added}`)} ${paint('error', `-${removed}`)}`
    })
  }
  const search: CardBodyLook = (card, width) => {
    const view = card.result?.view
    if (view?.card !== 'search') return generic(card, width)
    const found = `${view.total} ${view.shape === 'paths' ? 'paths' : 'matches'}`
    return [view.truncated ? `${found}${paint('warning', ' (truncated)')}` : found]
  }
  const read: CardBodyLook = (card, width) => {
    const view = card.result?.view
    if (view?.card !== 'read') return generic(card, width)
    return [cut(`${view.lines.length} lines of ${view.totalLines}`, width)]
  }
  const web: CardBodyLook = (card, width) => {
    const { result } = card
    if (result?.view?.card !== 'web') return generic(card, width)
    return [...titled(result.view.title, width), ...first(card, result.text, width)]
  }
  const kinds: Readonly<Record<string, CardBodyLook>> = { generic, terminal, diff, search, read, web }

  const pieces = {
    mark: () => binnacle.lookOf<CardMarkLook>(['transcript.card.mark'], mark),
    most: () => binnacle.lookOf<CardMostLook>(['transcript.card.most'], most),
    title: () => binnacle.lookOf<CardTitleLook>(['transcript.card.title'], title),
    time: () => binnacle.lookOf<CardTimeLook>(['transcript.card.time'], time),
    body: (card: Card) => {
      const kind = (card.result === undefined ? card.call?.card : card.result.view?.card) ?? 'generic'
      return binnacle.lookOf<CardBodyLook>([`transcript.tool.${card.name}`, `transcript.card.${kind}`], kinds[kind] ?? generic)
    },
  }

  const cardLook: CardLook = (card, { width, isFolded }) => {
    const took = pieces.time()(card)
    const after = took === '' ? '' : paint('muted', ` · ${took}`)
    const body = pieces.body(card)(card, Math.max(1, width - visibleWidth(FIRST)))
    if (body.length === 0) return [pieces.title()(card, width - visibleWidth(after)) + after]
    const region = `${card.seq}/body`
    const folded = isFolded(region)
    const count = folded ? paint('muted', ` (${body.length} ${body.length === 1 ? 'line' : 'lines'})`) : ''
    const text = pieces.title()(card, width - visibleWidth(after) - visibleWidth(count)) + after + count
    return folded ? [{ text, fold: region }] : [{ text, fold: region }, ...body.map((line, at) => (at === 0 ? FIRST : REST) + line)]
  }

  // The events only grow until an author replaces them, so each draw indexes only the events that came since the last.
  let indexed: readonly SessionEvent[] | undefined
  let count = 0
  const calls = new Map<string, SessionEvent>()
  const results = new Map<string, SessionEvent>()
  const index = (): void => {
    const events = transcript.state?.events ?? []
    if (events !== indexed || events.length < count) {
      indexed = events
      count = 0
      calls.clear()
      results.clear()
    }
    for (; count < events.length; count++) {
      const event = events[count]!
      const data = fields(event.data)
      if (event.type === 'tool/call' && typeof data?.callId === 'string' && !calls.has(data.callId)) calls.set(data.callId, event)
      const of = fields(data?.message)?.toolCallId
      if (event.type === 'tool/result' && typeof of === 'string' && !results.has(of)) results.set(of, event)
    }
  }

  // A presenter is pure, so a view is kept for its event while the tool that made it is the same.
  const views = new WeakMap<SessionEvent, { readonly tool: ToolDefinition; readonly view: ToolCallView | ToolResultView | undefined }>()
  const viewOf = <V>(
    event: SessionEvent,
    tool: ToolDefinition | undefined,
    present: (tool: ToolDefinition) => V | undefined,
  ): V | undefined => {
    if (tool === undefined) return undefined
    const kept = views.get(event)
    if (kept?.tool === tool) return kept.view as V | undefined
    const view = safely(() => present(tool))
    views.set(event, { tool, view: view as ToolCallView | ToolResultView | undefined })
    return view
  }

  const cardOf = (event: SessionEvent): Card | undefined => {
    const called = callOf(event)
    if (called === undefined) return undefined
    const { args, parsed } = parse(called.args)
    const tool = parsed ? safely(() => ctx.get('tools')?.get(called.name, ctx.get('binnacleSession')?.agent)) : undefined
    const callId = fields(event.data)?.callId
    index()
    const answered = typeof callId === 'string' ? results.get(callId) : undefined
    const data = fields(answered?.data)
    const message = fields(data?.message)
    const view =
      answered === undefined
        ? undefined
        : viewOf(answered, tool, (each) =>
            each.presentResult?.(args, {
              content: Array.isArray(message?.content) ? message.content : [],
              isError: message?.isError === true,
              ...(data?.meta !== undefined && { meta: data.meta as never }),
            }),
          )
    const result = answered === undefined ? undefined : { view, text: textOf(answered), failed: failed(answered) || shellFailed(view) }
    const card: Card = {
      seq: event.seq,
      name: called.name,
      args,
      call: viewOf(event, tool, (each) => each.presentCall?.(args)),
      result,
      startedAt: event.time,
      endedAt: answered?.time,
    }
    raws.set(card, called.args)
    return card
  }

  binnacle.look<EventLook>('transcript.event.tool/call', (beneath) => (event, at) => {
    const card = cardOf(event)
    if (card === undefined) return beneath(event, at)
    const lines = binnacle.lookOf<CardLook>(['transcript.card'], cardLook)(card, { width: at.width, isFolded: at.isFolded })
    return lines.length === 0 ? [] : [...lines, '']
  })
  binnacle.look<EventLook>('transcript.event.tool/result', (beneath) => (event, at) => {
    const of = fields(fields(event.data)?.message)?.toolCallId
    index()
    return typeof of === 'string' && calls.has(of) ? [] : beneath(event, at)
  })
}
