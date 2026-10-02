import { Box, Markdown, Text, visibleWidth } from '@earendil-works/pi-tui'
import type { KeyBinding, Region } from '../contract/index.ts'
import type { Node, Span } from './node.ts'
import { readable } from './readable.ts'
import { binnacleTheme } from './theme.ts'
import type { FoldStart, Mark, Theme, Tone } from './theme.ts'

export interface LayoutState {
  readonly toggled: ReadonlySet<string>
  readonly focus?: string
  readonly folds?: FoldStart
  readonly now?: number
  readonly keys?: (binding: KeyBinding) => readonly string[]
}

export interface Placed {
  readonly region: Region
  readonly top: number
  readonly height: number
  readonly left: number
  readonly width: number
}

const SHOW_GUTTER = 2

export interface Frame {
  readonly lines: readonly string[]
  readonly regions: readonly Placed[]
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

export function layout(node: Node, width: number, state: LayoutState, theme: Theme = binnacleTheme): Frame {
  return drawn(readable(at(node, state.now)), width, state, theme)
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

function drawn(node: Node, width: number, state: LayoutState, theme: Theme): Frame {
  switch (node.kind) {
    case 'blank':
      return { lines: [''], regions: [] }
    case 'text':
      return { lines: new Text(written(node, theme), 0, 0).render(width), regions: [] }
    case 'markdown':
      return { lines: new Markdown(node.text, 0, 0, theme.markdown).render(width).map((line) => inProse(line, theme)), regions: [] }
    case 'stack': {
      const lines: string[] = []
      const regions: Placed[] = []
      for (const child of node.children) {
        const frame = drawn(child, width, state, theme)
        regions.push(...frame.regions.map((placed) => ({ ...placed, top: placed.top + lines.length })))
        lines.push(...frame.lines)
      }
      return { lines, regions }
    }
    case 'offer': {
      const frame = drawn(node.child, width, state, theme)
      const region = { id: node.id, affordances: node.affordances, overflows: false }
      const placed = { region, top: 0, height: frame.lines.length, left: 0, width }
      const primary = node.affordances[0]
      if (state.focus !== node.id || primary === undefined) return { lines: frame.lines, regions: [placed, ...frame.regions] }
      const row = focusRow(primary.label ?? theme.words[`offer.${primary.kind}`], width, theme)
      return { lines: [...frame.lines, ...row], regions: [{ ...placed, height: frame.lines.length + row.length }, ...frame.regions] }
    }
    case 'ask':
      return ask(node, width, state, theme)
    case 'show':
      return show(node, width, state, theme)
    case 'part':
      return drawn(node.child, width, state, theme)
    case 'band':
      return band(node, width, state, theme)
    case 'fold': {
      const frame = drawn(node.child, width, state, theme)
      // Node rows override fold start rows.
      const rows = node.rows ?? state.folds?.rows ?? 3
      const opened = state.toggled.has(node.id) !== (state.folds?.open ?? false)
      const cut = frame.lines.length - rows
      const foldsUnder = rows === 0 ? node.title : undefined
      const title = node.title === undefined ? [] : new Text(titleLine(node.title, node.tone, theme), 0, 0).render(width)
      const below = frame.regions.map((placed) => ({ ...placed, top: placed.top + title.length }))
      if (cut <= 0) return { lines: [...title, ...frame.lines], regions: below }
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
        if (state.focus !== node.id || foldsUnder !== undefined) return { lines, regions: [placed, ...underHeading] }
        const row = focusRow(away, width, theme)
        return { lines: [...lines, ...row], regions: [{ ...placed, height: lines.length + row.length }, ...underHeading] }
      }
      if (foldsUnder !== undefined) {
        const marker =
          state.focus === node.id
            ? focusWithTitle(plainTitle(foldsUnder, theme), label, width, theme)
            : new Text(titleLine([...foldsUnder, ` ${theme.chrome.separator} ${theme.words.holds(cut)}`], node.tone, theme), 0, 0).render(
                width,
              )
        return { lines: marker, regions: [{ region, top: 0, height: marker.length, left: 0, width }] }
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
      return { lines, regions: [{ region, top: 0, height: lines.length, left: 0, width }, ...inside] }
    }
  }
}

function refilled(line: string, fill: (text: string) => string): string {
  const opening = fill('').slice(0, -DEFAULT_BACKGROUND.length)
  return line.replaceAll(DEFAULT_BACKGROUND, `${DEFAULT_BACKGROUND}${opening}`)
}

const DEFAULT_BACKGROUND = '\x1b[49m'

function ask(node: Extract<Node, { readonly kind: 'ask' }>, width: number, state: LayoutState, theme: Theme): Frame {
  const pad = theme.spacing.ask
  const side = 1 + pad
  const inner = width - 2 * side
  if (inner < 1) return drawn(node.child, width, state, theme)
  const frame = drawn(node.child, inner, state, theme)
  const edge = (text: string): string => inTone(text, node.edge ?? 'border', theme)
  const fill = node.background === undefined ? undefined : theme.backgrounds[node.background]
  const border = theme.chrome.border
  // Don't cut title; a cut one reads as another one.
  const title = node.title !== undefined && visibleWidth(node.title) <= width - 6 ? node.title : undefined
  const top =
    title === undefined
      ? edge(`${border.topLeft}${border.horizontal.repeat(width - 2)}${border.topRight}`)
      : `${edge(`${border.topLeft}${border.horizontal} `)}${title}${edge(` ${border.horizontal.repeat(width - 5 - visibleWidth(title))}${border.topRight}`)}`
  const body = frame.lines.map(
    (row) => `${edge(border.side)}${' '.repeat(pad)}${row}${' '.repeat(Math.max(0, inner - visibleWidth(row)) + pad)}${edge(border.side)}`,
  )
  const hint = answeredBy(frame, state, theme)
  const named = hint !== undefined && visibleWidth(hint) <= width - 6 ? hint : undefined
  const bottom =
    named === undefined
      ? edge(`${border.bottomLeft}${border.horizontal.repeat(width - 2)}${border.bottomRight}`)
      : `${edge(`${border.bottomLeft}${border.horizontal} `)}${named}${edge(` ${border.horizontal.repeat(width - 5 - visibleWidth(named))}${border.bottomRight}`)}`
  const lines = [top, ...body, bottom]
  return {
    lines: fill === undefined ? lines : lines.map((line) => fill(refilled(line, fill))),
    regions: frame.regions.map((placed) => ({ ...placed, top: placed.top + 1, left: placed.left + side })),
  }
}

function show(node: Extract<Node, { readonly kind: 'show' }>, width: number, state: LayoutState, theme: Theme): Frame {
  const title = new Text(
    written({ kind: 'text', text: node.title, ...(node.tone === undefined ? {} : { tone: node.tone }) }, theme),
    0,
    0,
  ).render(width)
  const inner = width - SHOW_GUTTER
  const frame = drawn(node.child, inner < 1 ? width : inner, state, theme)
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
    lines: [...title, ...(inner < 1 ? frame.lines : frame.lines.map((row) => `${gutter} ${row}`))],
    regions: [
      ...head,
      ...held.map((placed) => ({ ...placed, top: placed.top + title.length, left: placed.left + (inner < 1 ? 0 : SHOW_GUTTER) })),
    ],
  }
}

function answeredBy(frame: Frame, state: LayoutState, theme: Theme): string | undefined {
  const offers = frame.regions.filter((placed) => placed.region.affordances.length > 0).length
  if (state.keys === undefined || offers === 0) return undefined
  const named = (binding: KeyBinding, word: string): readonly string[] => {
    const bound = state.keys?.(binding) ?? []
    return bound.length === 0 ? [] : [`${bound.join('/')} ${word}`]
  }
  const hints = [...named('primary', theme.words.select), ...(offers > 1 ? named('focus.next', theme.words.next) : [])]
  return hints.length === 0 ? undefined : hints.join(` ${theme.chrome.separator} `)
}

function band(node: Extract<Node, { readonly kind: 'band' }>, width: number, state: LayoutState, theme: Theme): Frame {
  const pad = theme.spacing.band
  const inner = width - 2 * pad
  if (inner < 1) return drawn(node.child, width, state, theme)
  const frame = drawn(node.child, inner, state, theme)
  const box = new Box(pad, pad, theme.backgrounds[node.background])
  // Box renders the frame's lines directly; nothing is cached since bands are laid out anew each time.
  box.addChild({ render: () => [...frame.lines], invalidate: () => {} })
  return {
    lines: box.render(width),
    regions: frame.regions.map((placed) => ({ ...placed, top: placed.top + pad, left: placed.left + pad })),
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
