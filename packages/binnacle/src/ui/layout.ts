import { Box, Markdown, Text, visibleWidth } from '@earendil-works/pi-tui'
import type { KeyBinding, Region } from '../contract/index.ts'
import type { Node, Span } from './node.ts'
import { readable } from './readable.ts'
import { binnacleTheme } from './theme.ts'
import type { FoldStart, Mark, Theme, Tone } from './theme.ts'
import type { AskState } from './state.ts'

export interface LayoutState {
  readonly toggled: ReadonlySet<string>
  readonly focus?: string
  readonly folds?: FoldStart
  readonly now?: number
  readonly keys?: (binding: KeyBinding) => readonly string[]
  /** The room the host gives the ask at the root of what is drawn, in rows with the edges included; absent when its place gives none. */
  readonly room?: number
  /** Where each ask's prose page and offers' window stand, keyed by the ask's order in the drawing; an ask with no entry starts at its first page and window. */
  readonly asks?: readonly (AskState | undefined)[]
  /** Where this drawing's asks begin in `asks`, when the drawing is one part of a larger one; absent, at its first ask. */
  readonly askAt?: number
}

export interface Placed {
  readonly region: Region
  readonly top: number
  readonly height: number
  readonly left: number
  readonly width: number
}

/** What one ask drew: where its prose page and offers' window stand after layout clamped them. */
export interface AskDrawn {
  /** The top row of the prose page shown, and how many pages the prose pages into. */
  readonly page: number
  readonly pages: number
  /** How many rows of prose one full page shows; a page steps one row less, keeping a row of the last. */
  readonly pageRows: number
  /** The index of the first offer the window shows, and how many offers it holds. */
  readonly window: number
  readonly shown: number
  /** Every offer's id in order, the ones the window holds away included. */
  readonly offers: readonly string[]
}

export interface Frame {
  readonly lines: readonly string[]
  readonly regions: readonly Placed[]
  /** Every offer's id in order, the windowed away included, so focus reaches them; only the drawn have regions, so a click lands only on what is shown. */
  readonly focusable: readonly string[]
  /** What each ask drew, in the order the drawing holds them. */
  readonly asks: readonly AskDrawn[]
}

function focusRow(label: string, width: number, theme: Theme): string[] {
  return new Text(theme.tones.accent(`${theme.chrome.focus} ${label}`), 0, 0).render(width)
}

function inTone(text: string, tone: Tone | undefined, theme: Theme): string {
  const paint = theme.tones[tone ?? 'text']
  return paint === undefined ? text : paint(text)
}

/** A line of a document in prose's style, which each part's own style, laid inside it, gives way to and gives back. */
function inProse(line: string, theme: Theme): string {
  const [opening = '', closing = ''] = theme.tones.text('\u0000').split('\u0000')
  if (opening === '') return line
  const reopened = ['\x1b[0m', '\x1b[39m', '\x1b[49m'].reduce((sofar, reset) => sofar.replaceAll(reset, `${reset}${opening}`), line)
  return `${opening}${reopened}${closing}`
}

function markIn(name: Mark, theme: Theme): { readonly glyph: string; readonly tone: Tone } {
  return theme.marks[name] ?? theme.marks.unknown
}

function written(node: Extract<Node, { readonly kind: 'text' }>, theme: Theme): string {
  if (typeof node.text === 'string') return inTone(node.text, node.tone, theme)
  const runs: { text: string; tone: Tone | undefined }[] = []
  for (const span of node.text) {
    const run =
      typeof span === 'string'
        ? { text: span, tone: node.tone }
        : 'mark' in span
          ? { text: markIn(span.mark, theme).glyph, tone: span.tone ?? markIn(span.mark, theme).tone }
          : // `at` writes the time since a moment before anything is drawn; one reaching here reads as none.
            'since' in span || 'until' in span
            ? { text: elapsed(0), tone: span.tone ?? node.tone }
            : { text: span.text, tone: span.tone }
    const last = runs.at(-1)
    if (last !== undefined && last.tone === run.tone) last.text += run.text
    else runs.push(run)
  }
  return runs.map((run) => inTone(run.text, run.tone, theme)).join('')
}

function titleLine(spans: readonly Span[], tone: Tone | undefined, theme: Theme): string {
  return written(tone === undefined ? { kind: 'text', text: spans } : { kind: 'text', text: spans, tone }, theme)
}

function plainTitle(spans: readonly Span[], theme: Theme): string {
  return spans
    .map((span) =>
      typeof span === 'string'
        ? span
        : 'mark' in span
          ? markIn(span.mark, theme).glyph
          : 'since' in span || 'until' in span
            ? elapsed(0)
            : span.text,
    )
    .join('')
}

function focusWithTitle(title: string, label: string, width: number, theme: Theme): string[] {
  return new Text(theme.tones.accent(`${theme.chrome.focus} ${title} ${theme.chrome.separator} ${label}`), 0, 0).render(width)
}

/** The state with the room left out, so an ask's child, and any ask below the root, is drawn with no room of it. */
function unroomed(state: LayoutState): LayoutState {
  const { room: _left, ...rest } = state
  return rest
}

export function layout(node: Node, width: number, state: LayoutState, theme: Theme = binnacleTheme): Frame {
  // Only the ask at the root of what is drawn is given the room; an ask anywhere else has none.
  return drawn(readable(at(node, state.now)), width, node.kind === 'ask' ? state : unroomed(state), theme, state.askAt ?? 0)
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

// Exhaustive over node kinds; a kind added to Node fails to compile until handled.
function at(node: Node, now: number | undefined): Node {
  const span = (each: Span): Span => {
    if (typeof each === 'string' || !('since' in each || 'until' in each)) return each
    const text = 'since' in each ? elapsed((now ?? each.since) - each.since) : elapsed(Math.max(0, each.until - (now ?? each.until)))
    return each.tone === undefined ? text : { text, tone: each.tone }
  }
  switch (node.kind) {
    case 'blank':
    case 'markdown':
      return node
    case 'text':
      return typeof node.text === 'string' ? node : { ...node, text: node.text.map(span) }
    case 'stack':
      return { ...node, children: node.children.map((child) => at(child, now)) }
    case 'offer':
    case 'ask':
    case 'part':
    case 'band':
      return { ...node, child: at(node.child, now) }
    case 'show':
      return { ...node, title: node.title.map(span), child: at(node.child, now) }
    case 'fold':
      return node.title === undefined
        ? { ...node, child: at(node.child, now) }
        : { ...node, title: node.title.map(span), child: at(node.child, now) }
  }
}

function drawn(node: Node, width: number, state: LayoutState, theme: Theme, askAt = 0): Frame {
  switch (node.kind) {
    case 'blank':
      return { lines: [''], regions: [], focusable: [], asks: [] }
    case 'text':
      return { lines: new Text(written(node, theme), 0, 0).render(width), regions: [], focusable: [], asks: [] }
    case 'markdown':
      return {
        lines: new Markdown(node.text, 0, 0, theme.markdown).render(width).map((line) => inProse(line, theme)),
        regions: [],
        focusable: [],
        asks: [],
      }
    case 'stack': {
      const lines: string[] = []
      const regions: Placed[] = []
      const focusable: string[] = []
      const asks: AskDrawn[] = []
      let next = askAt
      for (const child of node.children) {
        const frame = drawn(child, width, state, theme, next)
        next += frame.asks.length
        regions.push(...frame.regions.map((placed) => ({ ...placed, top: placed.top + lines.length })))
        focusable.push(...frame.focusable)
        asks.push(...frame.asks)
        lines.push(...frame.lines)
      }
      return { lines, regions, focusable, asks }
    }
    case 'offer': {
      const frame = drawn(node.child, width, state, theme, askAt)
      const region = { id: node.id, affordances: node.affordances, overflows: false }
      const placed = { region, top: 0, height: frame.lines.length, left: 0, width }
      const focusable = node.affordances.length > 0 ? [node.id, ...frame.focusable] : frame.focusable
      const primary = node.affordances[0]
      if (state.focus !== node.id || primary === undefined)
        return { lines: frame.lines, regions: [placed, ...frame.regions], focusable, asks: frame.asks }
      const row = focusRow(primary.label ?? theme.words[`offer.${primary.kind}`], width, theme)
      return {
        lines: [...frame.lines, ...row],
        regions: [{ ...placed, height: frame.lines.length + row.length }, ...frame.regions],
        focusable,
        asks: frame.asks,
      }
    }
    case 'ask':
      return ask(node, width, state, theme, askAt)
    case 'show':
      return show(node, width, state, theme, askAt)
    case 'part':
      return drawn(node.child, width, state, theme, askAt)
    case 'band':
      return band(node, width, state, theme, askAt)
    case 'fold': {
      const frame = drawn(node.child, width, state, theme, askAt)
      // Node rows override fold start rows.
      const rows = node.rows ?? state.folds?.rows ?? 3
      const opened = state.toggled.has(node.id) !== (state.folds?.open ?? false)
      const cut = frame.lines.length - rows
      const foldsUnder = rows === 0 ? node.title : undefined
      const title = node.title === undefined ? [] : new Text(titleLine(node.title, node.tone, theme), 0, 0).render(width)
      const below = frame.regions.map((placed) => ({ ...placed, top: placed.top + title.length }))
      // A fold that holds everything it has offers nothing, so it takes no focus either; what its rows do not
      // show is not drawn, so it takes none either.
      const shows = (id: string): boolean => frame.regions.some((placed) => placed.region.id === id && placed.top < rows)
      const held = cut <= 0 || opened ? frame.focusable : frame.focusable.filter(shows)
      const focusable = cut <= 0 ? frame.focusable : [node.id, ...held]
      const asks = frame.asks
      if (cut <= 0) return { lines: [...title, ...frame.lines], regions: below, focusable, asks }
      const label = theme.words.show(cut)
      const region = { id: node.id, affordances: [{ kind: 'expand' as const, label }], overflows: false }
      if (opened) {
        const away = rows === 0 ? theme.words.away : theme.words.to(rows)
        const open = { id: node.id, affordances: [{ kind: 'expand' as const, label: away }], overflows: false }
        // For a fold of no rows, put title on top so it doesn't sit below content that may run long.
        const heading =
          foldsUnder === undefined
            ? title
            : state.focus === node.id
              ? focusWithTitle(plainTitle(foldsUnder, theme), away, width, theme)
              : new Text(titleLine([...foldsUnder, ` ${theme.chrome.separator} ${theme.words.less}`], node.tone, theme), 0, 0).render(width)
        const underHeading = frame.regions.map((placed) => ({ ...placed, top: placed.top + heading.length }))
        const lines = [...heading, ...frame.lines]
        const placed = { region: open, top: 0, height: foldsUnder === undefined ? lines.length : heading.length, left: 0, width }
        if (state.focus !== node.id || foldsUnder !== undefined) return { lines, regions: [placed, ...underHeading], focusable, asks }
        const row = focusRow(away, width, theme)
        return {
          lines: [...lines, ...row],
          regions: [{ ...placed, height: lines.length + row.length }, ...underHeading],
          focusable,
          asks,
        }
      }
      if (foldsUnder !== undefined) {
        const marker =
          state.focus === node.id
            ? focusWithTitle(plainTitle(foldsUnder, theme), label, width, theme)
            : new Text(titleLine([...foldsUnder, ` ${theme.chrome.separator} ${theme.words.holds(cut)}`], node.tone, theme), 0, 0).render(
                width,
              )
        return {
          lines: marker,
          regions: [{ region, top: 0, height: marker.length, left: 0, width }],
          focusable: [node.id],
          asks,
        }
      }
      const shown = frame.lines.slice(0, rows)
      // Focused marker is same row, so focusing doesn't move.
      const marker = new Text(
        state.focus === node.id ? theme.tones.accent(`${theme.chrome.focus} ${label}`) : `${theme.chrome.cut} ${theme.words.cut(cut)}`,
        0,
        0,
      ).render(width)
      const lines = [...title, ...shown, ...marker]
      const inside = frame.regions
        .filter((placed) => placed.top < rows)
        .map((placed) => ({ ...placed, top: placed.top + title.length, height: Math.min(placed.height, rows - placed.top) }))
      return { lines, regions: [{ region, top: 0, height: lines.length, left: 0, width }, ...inside], focusable, asks }
    }
  }
}

function refilled(line: string, fill: (text: string) => string): string {
  const opening = fill('').slice(0, -DEFAULT_BACKGROUND.length)
  return line.replaceAll(DEFAULT_BACKGROUND, `${DEFAULT_BACKGROUND}${opening}`)
}

const DEFAULT_BACKGROUND = '\x1b[49m'

function ask(node: Extract<Node, { readonly kind: 'ask' }>, width: number, state: LayoutState, theme: Theme, askAt: number): Frame {
  const pad = theme.spacing.ask
  const side = 1 + pad
  const inner = width - 2 * side
  if (inner < 1) return drawn(node.child, width, unroomed(state), theme, askAt)
  const held = drawn(node.child, inner, unroomed(state), theme, askAt + 1)
  const named = node.rows ?? theme.asks.rows
  const room = state.room
  // A named height is a box of exactly that height, never more than its room; a room alone caps what the ask grows to.
  const height = named !== undefined ? Math.min(named, room ?? named) : room
  const body = seated(held, height, named !== undefined, state, theme, askAt, inner)
  const edge = (text: string): string => inTone(text, node.edge ?? 'border', theme)
  const fill = node.background === undefined ? undefined : theme.backgrounds[node.background]
  const border = theme.chrome.border
  // Don't cut title; a cut one reads as another one.
  const title = node.title !== undefined && visibleWidth(node.title) <= width - 6 ? node.title : undefined
  const top =
    title === undefined
      ? edge(`${border.topLeft}${border.horizontal.repeat(width - 2)}${border.topRight}`)
      : `${edge(`${border.topLeft}${border.horizontal} `)}${title}${edge(` ${border.horizontal.repeat(width - 5 - visibleWidth(title))}${border.topRight}`)}`
  const rows = body.lines.map(
    (row) => `${edge(border.side)}${' '.repeat(pad)}${row}${' '.repeat(Math.max(0, inner - visibleWidth(row)) + pad)}${edge(border.side)}`,
  )
  const hint = answeredBy(state, theme, body.ask.offers.length, body.at, body.paged, width)
  const bottom =
    hint === undefined
      ? edge(`${border.bottomLeft}${border.horizontal.repeat(width - 2)}${border.bottomRight}`)
      : `${edge(`${border.bottomLeft}${border.horizontal} `)}${hint}${edge(` ${border.horizontal.repeat(width - 5 - visibleWidth(hint))}${border.bottomRight}`)}`
  const lines = [top, ...rows, bottom]
  return {
    lines: fill === undefined ? lines : lines.map((line) => fill(refilled(line, fill))),
    regions: body.regions.map((placed) => ({ ...placed, top: placed.top + 1, left: placed.left + side })),
    focusable: held.focusable,
    asks: [body.ask, ...held.asks],
  }
}

/** What an ask's body holds once seated in the height it is given: its rows, its regions, and where its page and window stand. */
interface Seated {
  readonly lines: readonly string[]
  readonly regions: readonly Placed[]
  readonly ask: AskDrawn
  /** Where the window is, as its bottom edge says it; absent when every offer is drawn. */
  readonly at: string | undefined
  /** Whether the prose is paged, so its keys are named on the bottom edge. */
  readonly paged: boolean
}

function seated(
  held: Frame,
  height: number | undefined,
  box: boolean,
  state: LayoutState,
  theme: Theme,
  askAt: number,
  inner: number,
): Seated {
  const natural = held.lines.length
  const offered = held.regions.filter((placed) => placed.region.affordances.length > 0).toSorted((one, two) => one.top - two.top)
  const ids = offered.map((placed) => placed.region.id)
  const body = height === undefined ? natural : height - 2
  if (height !== undefined && body >= 3 && natural > body) return windowed(held, offered, ids, body, state, theme, askAt, inner)
  const padded = box && body > natural ? Array.from({ length: body - natural }, () => '') : []
  return {
    lines: [...held.lines, ...padded],
    regions: held.regions,
    ask: { page: 0, pages: 1, pageRows: 0, window: 0, shown: ids.length, offers: ids },
    at: undefined,
    paged: false,
  }
}

/** An ask taller than its body: its prose paged by keys first, its offers windowed whole ones only, holding the focused one. */
function windowed(
  held: Frame,
  offered: readonly Placed[],
  ids: readonly string[],
  body: number,
  state: LayoutState,
  theme: Theme,
  askAt: number,
  inner: number,
): Seated {
  const natural = held.lines.length
  const prose = offered[0]?.top ?? natural
  const offerRows = natural - prose
  let pageRows: number
  let position = false
  let offerRoom: number
  if (offerRows <= body - 4) {
    offerRoom = offerRows
    pageRows = body - offerRows - 1
    position = true
  } else {
    pageRows = Math.min(prose, 3, body - 1)
    position = prose > pageRows
    offerRoom = Math.max(0, body - pageRows - (position ? 1 : 0))
  }
  const step = Math.max(1, pageRows - 1)
  const pages = prose <= pageRows ? 1 : Math.ceil((prose - pageRows) / step) + 1
  const furthest = (pages - 1) * step
  const asked = state.asks?.[askAt]
  const top = Math.min(Math.max(0, asked?.page ?? 0), furthest)
  // A page steps by one row less than it shows, keeping a row of the last; the state is clamped to that grid.
  const page = top - (top % step)
  const shown = Math.min(pageRows, prose - page)
  // The window follows focus, moving no further than it must; with nothing focused it starts where the state says.
  const focusAt = state.focus === undefined ? -1 : ids.indexOf(state.focus)
  const fitFrom = (from: number): { readonly end: number; readonly shown: number } => {
    const start = offered[from]?.top ?? natural
    const end = Math.min(start + offerRoom, natural)
    let fits = 0
    for (let index = from; index < offered.length; index++) {
      const each = offered[index]
      if (each === undefined || each.top + each.height > end) break
      fits++
    }
    return { end, shown: fits }
  }
  let window = Math.min(Math.max(0, asked?.window ?? 0), Math.max(0, ids.length - 1))
  let fit = fitFrom(window)
  if (focusAt >= 0 && (focusAt < window || focusAt >= window + fit.shown)) {
    // The least move that brings the focused offer in: up to it when it lies above, one offer on at a time below.
    window = focusAt < window ? focusAt : window
    while (window < focusAt) {
      fit = fitFrom(window)
      if (focusAt < window + fit.shown) break
      window++
    }
    fit = fitFrom(window)
  }
  const start = offered[window]?.top ?? natural
  const end = fit.end
  const cut = offered.filter((placed) => placed.top < end && placed.top + placed.height > end)
  const sliced = held.lines
    .slice(start, end)
    .map((row, index) => (cut.some((placed) => index + start >= placed.top && index + start < placed.top + placed.height) ? '' : row))
  const offerRowsDrawn = [...sliced, ...Array.from({ length: Math.max(0, offerRoom - sliced.length) }, () => '')]
  const offersAt = pageRows + (position ? 1 : 0)
  const said = position ? theme.words['page.at'](page / step + 1, pages) : undefined
  // The position word is left off whole where it cannot fit inside the border, as an ask's title is; its row stays.
  const positionRow = position ? (said !== undefined && visibleWidth(said) <= inner ? inTone(said, 'muted', theme) : '') : undefined
  const lines = [
    ...held.lines.slice(page, page + shown),
    ...(positionRow === undefined ? [] : [positionRow]),
    ...Array.from({ length: pageRows - shown }, () => ''),
    ...offerRowsDrawn,
  ]
  const regions = [
    ...held.regions.filter((placed) => placed.top >= page && placed.top + placed.height <= page + shown),
    ...held.regions
      .filter((placed) => placed.top >= start && placed.top + placed.height <= end)
      .map((placed) => ({ ...placed, top: placed.top - start + offersAt })),
  ]
  const where = fit.shown < ids.length ? theme.words['offer.at']((focusAt >= 0 ? focusAt : window) + 1, ids.length) : undefined
  return {
    lines,
    regions,
    ask: { page, pages, pageRows, window, shown: fit.shown, offers: ids },
    at: where,
    paged: pages > 1,
  }
}

function show(node: Extract<Node, { readonly kind: 'show' }>, width: number, state: LayoutState, theme: Theme, askAt: number): Frame {
  const title = new Text(
    written({ kind: 'text', text: node.title, ...(node.tone === undefined ? {} : { tone: node.tone }) }, theme),
    0,
    0,
  ).render(width)
  const aside = 1 + theme.spacing.show
  const inner = width - aside
  const frame = drawn(node.child, inner < 1 ? width : inner, state, theme, askAt)
  const gutter = inTone(theme.chrome.gutter, 'borderMuted', theme)
  const opened = frame.regions.find((placed) => placed.region.id === node.opens)
  const head =
    opened === undefined
      ? []
      : [
          {
            region: {
              ...opened.region,
              affordances: [...opened.region.affordances, { kind: 'copy' as const }],
              text: plainText(node.child, theme),
            },
            top: 0,
            height: title.length,
            left: 0,
            width,
          },
        ]
  // The fold keeps its rows, offering nothing there, so what focus brings into view is all of it.
  const held = frame.regions.map((placed) =>
    placed.region.id === node.opens ? { ...placed, region: { ...placed.region, affordances: [] } } : placed,
  )
  return {
    lines: [...title, ...(inner < 1 ? frame.lines : frame.lines.map((row) => `${gutter}${' '.repeat(theme.spacing.show)}${row}`))],
    regions: [
      ...head,
      ...held.map((placed) => ({ ...placed, top: placed.top + title.length, left: placed.left + (inner < 1 ? 0 : aside) })),
    ],
    focusable:
      opened === undefined || node.opens === undefined
        ? frame.focusable
        : [node.opens, ...frame.focusable.filter((id) => id !== node.opens)],
    asks: frame.asks,
  }
}

function answeredBy(
  state: LayoutState,
  theme: Theme,
  offers: number,
  where: string | undefined,
  paged: boolean,
  width: number,
): string | undefined {
  const named = (binding: KeyBinding, word: string): readonly string[] => {
    const bound = state.keys?.(binding) ?? []
    return bound.length === 0 ? [] : [`${bound.join('/')} ${word}`]
  }
  const paging = paged ? [...(state.keys?.('page.previous') ?? []), ...(state.keys?.('page.next') ?? [])] : []
  const hints = [
    ...(offers > 0 ? named('primary', theme.words.select) : []),
    ...(offers > 1 ? named('focus.next', theme.words.next) : []),
    ...(paging.length === 0 ? [] : [`${paging.join('/')} ${theme.words.page}`]),
    ...(where === undefined ? [] : [where]),
  ]
  // The edge keeps the tail of the hint that fits: where the ask is and what pages it outlive the keys everyone knows.
  for (let drop = 0; drop < hints.length; drop++) {
    const hint = hints.slice(drop).join(` ${theme.chrome.separator} `)
    if (visibleWidth(hint) <= width - 6) return hint
  }
  return undefined
}

function band(node: Extract<Node, { readonly kind: 'band' }>, width: number, state: LayoutState, theme: Theme, askAt: number): Frame {
  const pad = theme.spacing.band
  const inner = width - 2 * pad
  if (inner < 1) return drawn(node.child, width, state, theme, askAt)
  const frame = drawn(node.child, inner, state, theme, askAt)
  const box = new Box(pad, pad, theme.backgrounds[node.background])
  // Box renders the frame's lines directly; nothing is cached since bands are laid out anew each time.
  box.addChild({ render: () => [...frame.lines], invalidate: () => {} })
  return {
    lines: box.render(width),
    regions: frame.regions.map((placed) => ({ ...placed, top: placed.top + pad, left: placed.left + pad })),
    focusable: frame.focusable,
    asks: frame.asks,
  }
}

/** What a node says, as text: every line of it, what a fold holds away included. */
function plainText(node: Node, theme: Theme): string {
  switch (node.kind) {
    case 'blank':
      return ''
    case 'text':
      return typeof node.text === 'string' ? node.text : plainTitle(node.text, theme)
    case 'markdown':
      return node.text
    case 'stack':
      return node.children.map((child) => plainText(child, theme)).join('\n')
    case 'show':
      return [plainTitle(node.title, theme), plainText(node.child, theme)].join('\n')
    case 'fold':
      return node.title === undefined
        ? plainText(node.child, theme)
        : [plainTitle(node.title, theme), plainText(node.child, theme)].join('\n')
    case 'ask':
      return node.title === undefined ? plainText(node.child, theme) : [node.title, plainText(node.child, theme)].join('\n')
    case 'offer':
    case 'part':
    case 'band':
      return plainText(node.child, theme)
  }
}

/**
 * Every row a region is placed on, top to bottom: where its placements begin and how far they run.
 * @returns undefined when nothing of that id is placed.
 */
export function extent(regions: readonly Placed[], id: string): { readonly top: number; readonly height: number } | undefined {
  const placed = regions.filter((each) => each.region.id === id)
  if (placed.length === 0) return undefined
  const top = Math.min(...placed.map((each) => each.top))
  return { top, height: Math.max(...placed.map((each) => each.top + each.height)) - top }
}

export function under(regions: readonly Placed[], row: number, column: number): Region[] {
  return regions
    .filter(
      (placed) => row >= placed.top && row < placed.top + placed.height && column >= placed.left && column < placed.left + placed.width,
    )
    .map((placed) => placed.region)
    .toReversed()
}
