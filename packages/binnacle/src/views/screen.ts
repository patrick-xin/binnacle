import type { Fact } from '../facts/adapt.ts'
import { transcript } from '../models/transcript.ts'
import type { Entry, Transcript } from '../models/transcript.ts'
import { layout } from '../ui/layout.ts'
import type { AskDrawn, Frame, LayoutState, Placed } from '../ui/layout.ts'
import type { Node, Span } from '../ui/node.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import type { AskState, UiState } from '../ui/state.ts'
import { drawEntry, keyOf, partKinds } from './entries.ts'
import type { View, Views } from './entries.ts'

export interface Screen extends Frame {
  readonly focusable: readonly string[]
  readonly timed: boolean
  readonly ends: readonly number[]
}

export type DrawScreen = (model: Transcript, state: UiState, width: number, views?: Views, theme?: Theme, now?: number) => Screen

interface Drawing {
  readonly by: readonly (readonly View[] | undefined)[]
  readonly theme: Theme
  readonly node: Node
  readonly folds: readonly string[]
  readonly regions: readonly string[]
  readonly timed: boolean
  readonly laid?: {
    readonly width: number
    readonly theme: Theme
    readonly open: readonly boolean[]
    readonly focus: string | undefined
    readonly asks: readonly AskState[]
    readonly askAt: number
    readonly now: number | undefined
    readonly frame: Frame
  }
}

function foldsIn(node: Node): string[] {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return []
    case 'stack':
      return node.children.flatMap(foldsIn)
    case 'offer':
    case 'ask':
    case 'show':
    case 'part':
    case 'band':
      return foldsIn(node.child)
    case 'fold':
      return [node.id, ...foldsIn(node.child)]
  }
}

function scopeOf(entry: Entry): string {
  if (entry.kind === 'streaming') return `streaming-${entry.answer.turn}-${entry.answer.step}`
  return String(
    entry.kind === 'tool'
      ? entry.call.seq
      : entry.kind === 'approval'
        ? entry.asked.seq
        : entry.kind === 'command'
          ? entry.run.seq
          : entry.kind === 'compaction'
            ? entry.start.seq
            : entry.kind === 'retry'
              ? entry.retry.seq
              : entry.kind === 'workflow'
                ? entry.run.seq
                : entry.fact.seq,
  )
}

function scopedWithin(node: Node, scope: string): Node {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return node
    case 'stack':
      return { ...node, children: node.children.map((child) => scopedWithin(child, scope)) }
    case 'offer':
    case 'fold':
      return { ...node, id: `${scope}/${node.id}`, child: scopedWithin(node.child, scope) }
    case 'show':
      return { ...node, ...(node.opens === undefined ? {} : { opens: `${scope}/${node.opens}` }), child: scopedWithin(node.child, scope) }
    case 'ask':
    case 'part':
    case 'band':
      return { ...node, child: scopedWithin(node.child, scope) }
  }
}

function regionsIn(node: Node): string[] {
  switch (node.kind) {
    case 'blank':
    case 'text':
    case 'markdown':
      return []
    case 'stack':
      return node.children.flatMap(regionsIn)
    case 'offer':
    case 'fold':
      return [node.id, ...regionsIn(node.child)]
    case 'ask':
    case 'show':
    case 'part':
    case 'band':
      return regionsIn(node.child)
  }
}

/** Keeps each entry's drawing across redraws; `keys` is read as an entry is laid out, so rebinding needs a new drawer. */
export function screens(keys: () => LayoutState['keys'] = () => undefined): DrawScreen {
  const drawings = new WeakMap<Entry, Drawing>()
  const frameOf = (
    entry: Entry,
    state: UiState,
    width: number,
    views: Views,
    theme: Theme,
    now: number | undefined,
    askAt: number,
  ): Frame => {
    const by = [keyOf(entry), ...partKinds].map((key) => views.get(key))
    let drawing = drawings.get(entry)
    if (drawing === undefined || drawing.by.some((stack, index) => stack !== by[index]) || drawing.theme !== theme) {
      const node = scopedWithin(drawEntry(entry, views, theme), scopeOf(entry))
      drawing = { by, theme, node, folds: foldsIn(node), regions: regionsIn(node), timed: timedIn(node) }
    }
    const laid = drawing.laid
    const focus = state.focus !== undefined && drawing.regions.includes(state.focus) ? state.focus : undefined
    // An entry is laid out again only when its own asks moved, at the offset it now stands at: another
    // entry's ask, or its own moving to another offset, costs a fresh layout, never another entry's.
    const asksHeld =
      laid !== undefined &&
      laid.askAt === askAt &&
      laid.asks.every((ask, index) => {
        const held = state.asks?.[askAt + index]
        return (held?.page ?? 0) === ask.page && (held?.window ?? 0) === ask.window
      })
    if (
      laid?.width === width &&
      laid.theme === theme &&
      drawing.folds.every((id, index) => state.toggled.has(id) === laid.open[index]) &&
      laid.focus === focus &&
      asksHeld &&
      (!drawing.timed || laid.now === now)
    )
      return laid.frame
    const starts = theme.folds[keyOf(entry)] ?? theme.folds[entry.kind]
    const bound = keys()
    // The entry is told where its asks begin in the pane's state, so its drawing reads its own alone.
    const frame = layout(
      drawing.node,
      width,
      {
        ...state,
        ...(starts === undefined ? {} : { folds: starts }),
        ...(askAt === 0 ? {} : { askAt }),
        ...(now === undefined ? {} : { now }),
        ...(bound === undefined ? {} : { keys: bound }),
      },
      theme,
    )
    drawings.set(entry, {
      ...drawing,
      laid: {
        width,
        theme,
        open: drawing.folds.map((id) => state.toggled.has(id)),
        focus,
        asks: frame.asks.map((ask) => ({ page: ask.page, window: ask.window })),
        askAt,
        now,
        frame,
      },
    })
    return frame
  }
  return (model, state, width, views = new Map(), theme = binnacleTheme, now = undefined) => {
    const lines: string[] = []
    const regions: Placed[] = []
    const focusable: string[] = []
    const asks: AskDrawn[] = []
    const ends: number[] = []
    let drew = false
    let timed = false
    let askAt = 0
    for (const turn of model.turns) {
      for (const entry of turn.entries) {
        const frame = frameOf(entry, state, width, views, theme, now, askAt)
        askAt += frame.asks.length
        timed = timed || drawings.get(entry)?.timed === true
        const draws = frame.lines.length > 0
        if (draws && drew) for (let row = 0; row < theme.spacing.gap; row++) lines.push('')
        drew = drew || draws
        const top = lines.length
        for (const placed of frame.regions) regions.push({ ...placed, top: placed.top + top })
        focusable.push(...frame.focusable)
        asks.push(...frame.asks)
        for (const line of frame.lines) lines.push(line)
        ends.push(lines.length)
      }
    }
    return { lines, regions, focusable, asks, ends, timed }
  }
}

function timedSpans(text: string | readonly Span[] | undefined): boolean {
  return typeof text === 'object' && text.some((span) => typeof span === 'object' && ('since' in span || 'until' in span))
}

export function timedIn(node: Node): boolean {
  switch (node.kind) {
    case 'blank':
    case 'markdown':
      return false
    case 'text':
      return timedSpans(node.text)
    case 'stack':
      return node.children.some(timedIn)
    case 'offer':
    case 'ask':
    case 'part':
    case 'band':
      return timedIn(node.child)
    case 'show':
      return timedSpans(node.title) || timedIn(node.child)
    case 'fold':
      return timedSpans(node.title) || timedIn(node.child)
  }
}

export function screen(
  facts: readonly Fact[],
  state: UiState,
  width: number,
  views: Views = new Map(),
  theme: Theme = binnacleTheme,
): Screen {
  return screens()(transcript(facts), state, width, views, theme)
}
