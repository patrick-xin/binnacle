import type { Binnacle, Point, Watchable } from '../api.ts'
import { toPlainText } from '../core/view.ts'
import { truncateToWidth, visibleWidth } from '../terminal/utils.ts'
import { together } from './component.ts'
import type { Component } from './component.ts'

/** Where a tab is drawn. */
export interface TabAt {
  readonly current: boolean
  readonly index: number
}

/** The Look `tabs.tab`, or `<name>.tab`: how one tab is drawn. */
export type TabLook = (label: string, at: TabAt) => string

export interface TabsOptions {
  /** The instance's name: its Place, and the start of its actions' ids and its Looks' names. */
  readonly name: string
  /** Untrusted Text: the Tabs make each label plain. They draw while there is more than one. */
  readonly labels: () => readonly string[]
  /** The index of the current tab. One past the last draws the last as current. */
  readonly current: () => number
  /** The person went to the tab at this index, which is always one of the labels'. */
  readonly go: (index: number) => void
  /** The Places where tab and shift+tab move between the tabs, even while their Part takes keys. With none, the Tabs' own. */
  readonly keysIn?: string | readonly string[]
  /** What the labels and the current tab are drawn from, so that the Tabs are drawn again when they change. */
  readonly models?: readonly Watchable[]
}

interface Piece {
  readonly text: string
  /** The tab that a click on it goes to; a `more` or a separator has none. */
  readonly tab?: number
}

/** Makes Tabs in the Place `name`, with their actions `<name>.next` and `<name>.previous`, of the kinds `tabs.next` and `tabs.previous`. */
export function tabs(binnacle: Binnacle, options: TabsOptions): Component {
  const { name } = options
  const shown = (): boolean => options.labels().length > 1
  const current = (): number => Math.min(Math.max(0, options.current()), options.labels().length - 1)
  const pieces = (width: number): readonly Piece[] => {
    const look = binnacle.lookOf<TabLook>([`${name}.tab`, 'tabs.tab'], (label, at) => defaultTab(binnacle, label, at))
    const at = current()
    const drawn = options.labels().map((label, index) => look(toPlainText(label), { current: index === at, index }))
    return fitted(drawn, at, width, binnacle.tokens.glyphs)
  }

  // A click lands on the tab drawn under it, so the pieces of the last draw are kept.
  let drawn: readonly Piece[] = []
  const tabAt = (at: Point): number | undefined => {
    if (at.line !== 0) return undefined
    let start = 0
    for (const piece of drawn) {
      const end = start + visibleWidth(piece.text)
      if (at.column < end) return piece.tab
      start = end
    }
    return undefined
  }
  const placed = binnacle.place(name, {
    models: options.models ?? [],
    lines: (width) => {
      drawn = shown() ? pieces(width) : []
      return drawn.length === 0 ? [] : [drawn.map((piece) => piece.text).join('')]
    },
    // The Part's own click, not an action, so that a click on the Tabs leaves the Focus where it is, as on a Line.
    click: (at) => {
      const index = tabAt(at)
      if (index !== undefined) options.go(index)
      return index !== undefined
    },
  })
  const step = (by: number): void => {
    const count = options.labels().length
    options.go((current() + by + count) % count)
  }
  const act = (verb: string, keys: readonly string[], description: string, by: number) =>
    binnacle.action(`${name}.${verb}`, {
      kind: `tabs.${verb}`,
      keys,
      first: true,
      place: options.keysIn ?? name,
      enabled: shown,
      description,
      run: () => step(by),
    })
  const actions = [act('next', ['tab'], 'Go to the next tab', 1), act('previous', ['shift+tab'], 'Go to the tab before', -1)]
  return { handle: together(placed, actions) }
}

// The current tab is drawn, then its neighbours while they fit; a `more` marks each end where the row is cut.
function fitted(
  drawn: readonly string[],
  at: number,
  width: number,
  glyphs: { readonly separator: string; readonly more: string },
): Piece[] {
  const { separator, more } = glyphs
  const cells = (from: number, to: number): number => {
    let sum = 0
    for (let index = from; index <= to; index++) sum += visibleWidth(drawn[index] ?? '')
    const ends = (from > 0 ? 1 : 0) + (to < drawn.length - 1 ? 1 : 0)
    return sum + ends * visibleWidth(more) + (to - from + ends) * visibleWidth(separator)
  }
  let from = at
  let to = at
  for (let grew = true; grew;) {
    grew = false
    if (to < drawn.length - 1 && cells(from, to + 1) <= width) {
      to++
      grew = true
    }
    if (from > 0 && cells(from - 1, to) <= width) {
      from--
      grew = true
    }
  }
  const pieces: Piece[] = []
  const add = (piece: Piece): void => {
    if (pieces.length > 0) pieces.push({ text: separator })
    pieces.push(piece)
  }
  if (from > 0) add({ text: more })
  for (let index = from; index <= to; index++) add({ text: drawn[index] ?? '', tab: index })
  if (to < drawn.length - 1) add({ text: more })
  // A current tab wider than the row is cut, as the end markers go first.
  const over = cells(from, to) - width
  if (over > 0) {
    const tab = pieces.findIndex((piece) => piece.tab === at)
    const text = drawn[at] ?? ''
    const room = Math.max(0, visibleWidth(text) - over)
    // The `more` that cuts the tab is a piece of its own, so that a click on it does nothing, as on the end markers. It is drawn only where it fits.
    const cut = room >= visibleWidth(more) ? [{ text: more }] : []
    const kept = room - (cut.length > 0 ? visibleWidth(more) : 0)
    pieces.splice(tab, 1, { text: truncateToWidth(text, kept, ''), tab: at }, ...cut)
  }
  return pieces
}

function defaultTab(binnacle: Binnacle, label: string, at: TabAt): string {
  const { glyphs } = binnacle.tokens
  return at.current ? binnacle.paint('accent', `${glyphs.mark} ${label}`) : `${glyphs.unmarked} ${label}`
}
