import type { Action, Binnacle, Model, Point, Watchable } from '../api.ts'
import { createModel } from '../core/model.ts'
import { toPlainText } from '../core/view.ts'
import { together } from './component.ts'
import type { Component } from './component.ts'

export interface ListItem {
  /** Untrusted Text: the List makes it plain. */
  readonly label: string
  /** Untrusted Text, drawn after the label in the `muted` Tone. */
  readonly description?: string
  /** With it, the item draws a box, checked or not; with none, no box. */
  readonly checked?: boolean
}

export interface ListState {
  /** The index of the marked item. */
  mark: number
}

/** Where a row of a List is drawn. */
export interface ListRowAt {
  readonly marked: boolean
  readonly index: number
  readonly width: number
}

/** The Look `list.row`, or `<name>.row`: how one item of a List is drawn, given as the List's items are. */
export type ListRow<T extends ListItem = ListItem> = (item: T, at: ListRowAt) => string

/** A piece of a List's default row: the Looks `list.mark`, `list.label` and `list.description`, or `<name>.mark` and the rest. */
export type ListPiece<T extends ListItem = ListItem> = (item: T, at: ListRowAt) => string

export interface ListOptions<T extends ListItem = ListItem> {
  /** The instance's name: its Place, its Model's name, and the start of its actions' ids and its Looks' names. */
  readonly name: string
  readonly items: () => readonly T[]
  /** When what it returns changes, the mark goes back to the first item, as other items are shown. */
  readonly key?: () => unknown
  /** The person picked the item at this index: enter, or a click. */
  readonly pick: (index: number) => void
  /** The person toggled the marked item. Its action, `<name>.toggle`, has no keys until someone binds it or `list.toggle`. */
  readonly toggle?: (index: number) => void
  /** The Places where up, down, page up, page down and enter act on the List while it draws a line, even while their Part takes keys. With none, the List's own. A click and `toggle` stay in the List's own Place. */
  readonly keysIn?: string | readonly string[]
  /** What the items are drawn from, so that the List is drawn again when they change. */
  readonly models?: readonly Watchable[]
}

export interface ListComponent extends Component {
  readonly model: Model<ListState>
}

/** Makes a List in the Place `name`, with its actions `<name>.<verb>` of the kind `list.<verb>`: `up`, `down`, `pageUp`, `pageDown`, `pick`, `click` and `toggle`. */
export function list<T extends ListItem = ListItem>(binnacle: Binnacle, options: ListOptions<T>): ListComponent {
  const { name } = options
  const model = createModel<ListState>({ mark: 0 })
  let key: unknown
  // The mark is set right as the items are read, without a change to watch: a draw reads them, and must not draw again.
  const items = (): readonly T[] => {
    const now = options.key?.()
    const shown = options.items()
    if (now !== key) {
      key = now
      model.state.mark = 0
    }
    if (model.state.mark >= shown.length) model.state.mark = Math.max(0, shown.length - 1)
    return shown
  }
  const markTo = (to: (count: number, mark: number) => number): void => {
    const count = items().length
    if (count > 0) model.set((state) => (state.mark = to(count, state.mark)))
  }
  const page = (): number => Math.max(1, binnacle.linesShown(name) ?? 1)

  const named = binnacle.model(name, model)
  const placed = binnacle.place(name, {
    models: [model, ...(options.models ?? [])],
    lines: (width) => {
      const piece = (verb: string, fallback: ListPiece<T>) => binnacle.lookOf<ListPiece<T>>([`${name}.${verb}`, `list.${verb}`], fallback)
      const pieces: Pieces<T> = {
        mark: piece('mark', (_, at) => markOf(binnacle, at)),
        label: piece('label', (item, at) => labelOf(binnacle, item, at)),
        description: piece('description', (item) => descriptionOf(binnacle, item)),
      }
      const row = binnacle.lookOf<ListRow<T>>([`${name}.row`, 'list.row'], (item, at) => defaultRow(binnacle, pieces, item, at))
      return items().map((item, index) => row(item, { marked: index === model.state.mark, index, width }))
    },
    // The cursor stays hidden; it keeps the marked item in view as the Place scrolls.
    cursor: () => (items().length === 0 ? undefined : { line: model.state.mark, column: 0 }),
    follow: 'least',
  })
  const own = { place: name }
  const { keysIn } = options
  // In another Place, the List's keys come before that Place's Part, and only while the List is there to see.
  const keyed = keysIn === undefined ? own : { place: keysIn, first: true, enabled: () => (binnacle.linesShown(name) ?? 0) > 0 }
  const act = (
    where: Pick<Action, 'place' | 'first' | 'enabled'>,
    verb: string,
    keys: readonly string[],
    description: string,
    run: (at: Point | undefined) => void,
  ) => binnacle.action(`${name}.${verb}`, { kind: `list.${verb}`, keys, ...where, description, run: (at) => run(at) })
  const actions = [
    act(keyed, 'up', ['up'], 'Mark the item above', () => markTo((count, mark) => (mark - 1 + count) % count)),
    act(keyed, 'down', ['down'], 'Mark the item below', () => markTo((count, mark) => (mark + 1) % count)),
    act(keyed, 'pageUp', ['pageUp'], 'Mark the item a page above', () => markTo((_, mark) => Math.max(0, mark - page()))),
    act(keyed, 'pageDown', ['pageDown'], 'Mark the item a page below', () => markTo((count, mark) => Math.min(count - 1, mark + page()))),
    act(keyed, 'pick', ['enter'], 'Pick the marked item', () => {
      if (items().length > 0) options.pick(model.state.mark)
    }),
    act(own, 'click', ['click'], 'Pick the item clicked', (at) => {
      if (at === undefined || at.line >= items().length) return
      model.set((state) => (state.mark = at.line))
      options.pick(at.line)
    }),
    act(own, 'toggle', [], 'Toggle the marked item', () => {
      if (items().length > 0) options.toggle?.(model.state.mark)
    }),
  ]
  return { model, handle: together(placed, [named, ...actions]) }
}

interface Pieces<T extends ListItem> {
  readonly mark: ListPiece<T>
  readonly label: ListPiece<T>
  readonly description: ListPiece<T>
}

function defaultRow<T extends ListItem>(binnacle: Binnacle, pieces: Pieces<T>, item: T, at: ListRowAt): string {
  const { glyphs } = binnacle.tokens
  const box = item.checked === undefined ? '' : `${boxOf(binnacle, item.checked ? glyphs.checked : glyphs.unchecked, item.checked)} `
  return `${pieces.mark(item, at)} ${box}${pieces.label(item, at)}${pieces.description(item, at)}`
}

function markOf(binnacle: Binnacle, at: ListRowAt): string {
  const { glyphs } = binnacle.tokens
  return at.marked ? binnacle.paint('accent', glyphs.mark) : glyphs.unmarked
}

function labelOf(binnacle: Binnacle, item: ListItem, at: ListRowAt): string {
  const label = toPlainText(item.label)
  return at.marked ? binnacle.paint('accent', label) : label
}

function descriptionOf(binnacle: Binnacle, item: ListItem): string {
  return item.description === undefined ? '' : binnacle.paint('muted', ` — ${toPlainText(item.description)}`)
}

const OPENS = '[(<{'
const CLOSES = '])>}'

// A box glyph such as `[x]` is a frame around what it holds: its frame draws in `border`, and a checked box's inside in `success`.
function boxOf(binnacle: Binnacle, glyph: string, checked: boolean): string {
  const chars = [...glyph]
  const open = chars[0] ?? ''
  const close = chars.at(-1) ?? ''
  if (chars.length < 3 || !OPENS.includes(open) || !CLOSES.includes(close)) return binnacle.paint(checked ? 'success' : 'border', glyph)
  const inside = chars.slice(1, -1).join('')
  return binnacle.paint('border', open) + (checked ? binnacle.paint('success', inside) : inside) + binnacle.paint('border', close)
}
