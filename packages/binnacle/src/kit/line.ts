import type { Binnacle, Model, Watchable } from '../api.ts'
import { createModel } from '../core/model.ts'
import { Input } from '../terminal/components/input.ts'
import { CURSOR_MARKER } from '../terminal/tui.ts'
import { visibleWidth } from '../terminal/utils.ts'
import { together } from './component.ts'
import type { Component } from './component.ts'

export interface LineState {
  /** The text of each key that the Line has shown: `key()`'s value, or `undefined` with no `key`. Set one to change the Line; the cursor goes to its end. */
  readonly texts: Map<unknown, string>
}

/** The text being typed, with its cursor, drawn in `width` cells and scrolled to show the cursor. */
export type Typed = (width: number) => string

/** The Look `line.row`, or `<name>.row`: how the Line is drawn. */
export type LineRow = (typed: Typed, at: { readonly width: number }) => string

export interface LineOptions {
  /** The instance's name: its Place, its Model's name, and the start of its Looks' names. */
  readonly name: string
  /** While it returns true, the Line is drawn, and takes every key while its Place has the Focus. */
  readonly shown: () => boolean
  /** Which text the Line holds: each value keeps its own. */
  readonly key?: () => unknown
  /** The person pressed enter. The text stays until the author clears it. */
  readonly submit: (text: string) => void
  /** The person pressed escape. */
  readonly escape: () => void
  /** What `shown()` and `key()` read, so that the Line is drawn again when they change. */
  readonly models?: readonly Watchable[]
}

export interface LineComponent extends Component {
  readonly model: Model<LineState>
}

/** Makes a Line in the Place `name`: a line that a person types in. */
export function line(binnacle: Binnacle, options: LineOptions): LineComponent {
  const { name } = options
  const model = createModel<LineState>({ texts: new Map() })
  const inputs = new Map<unknown, Input>()
  // The Model is what the Line holds: an Input whose text is not the Model's is made again from it.
  const input = (): Input => {
    const key = options.key?.()
    const text = model.state.texts.get(key) ?? ''
    const kept = inputs.get(key)
    if (kept !== undefined && kept.getValue() === text) return kept
    const made = new Input({ prompt: '' })
    made.focused = true
    made.onSubmit = (typed) => options.submit(typed)
    made.onEscape = () => options.escape()
    // A paste leaves the cursor at the end of the text, which `setValue` does not.
    if (text !== '') made.handleInput(`\x1b[200~${text}\x1b[201~`)
    inputs.set(key, made)
    return made
  }
  const drawn = (width: number): string => {
    const typed = input()
    const row = binnacle.lookOf<LineRow>([`${name}.row`, 'line.row'], (draw, at) => defaultRow(binnacle, draw, at.width))
    return row((within) => typed.render(within)[0] ?? '', { width })
  }

  const named = binnacle.model(name, model)
  const placed = binnacle.place(name, {
    models: [model, ...(options.models ?? [])],
    lines: (width) => (options.shown() ? [drawn(width).replace(CURSOR_MARKER, '')] : []),
    cursor: (width) => {
      if (!options.shown()) return undefined
      const text = drawn(width)
      const at = text.indexOf(CURSOR_MARKER)
      return { line: 0, column: at === -1 ? 0 : visibleWidth(text.slice(0, at)) }
    },
    key: (data) => {
      if (!options.shown()) return false
      const key = options.key?.()
      const typed = input()
      const before = typed.getValue()
      typed.handleInput(data)
      // Only a key that changed the text writes it, so that a `submit` that clears the Model is not undone.
      const after = typed.getValue()
      if (after !== before) model.set((state) => state.texts.set(key, after))
      return true
    },
  })
  return { model, handle: together(placed, [named]) }
}

function defaultRow(binnacle: Binnacle, typed: Typed, width: number): string {
  const prompt = `${binnacle.tokens.glyphs.mark} `
  return binnacle.paint('accent', prompt) + typed(Math.max(0, width - visibleWidth(prompt)))
}
