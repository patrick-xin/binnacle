import type { Binnacle, Watchable } from '../api.ts'
import { toPlainText } from '../core/view.ts'
import { visibleWidth } from '../terminal/utils.ts'
import type { Component } from './component.ts'

/** The Look `title.row`, or `<name>.row`: a Title drawn as a rule across the width. */
export type TitleRow = (text: string, at: { readonly width: number }) => string

export interface TitleOptions {
  /** The instance's name: its Place, and the start of its Looks' names. */
  readonly name: string
  /** Untrusted Text: the Title makes it plain. `undefined` draws nothing, and `''` the rule alone. */
  readonly text: () => string | undefined
  /** What the text is drawn from, so that the Title is drawn again when it changes. */
  readonly models?: readonly Watchable[]
}

/** Makes a Title in the Place `name`. */
export function title(binnacle: Binnacle, options: TitleOptions): Component {
  const { name } = options
  const handle = binnacle.place(name, {
    models: options.models ?? [],
    lines: (width) => {
      const text = options.text()
      if (text === undefined) return []
      const row = binnacle.lookOf<TitleRow>([`${name}.row`, 'title.row'], (plain, at) => defaultRow(binnacle, plain, at.width))
      return [row(toPlainText(text), { width })]
    },
  })
  return { handle }
}

function defaultRow(binnacle: Binnacle, text: string, width: number): string {
  const { rule } = binnacle.tokens.glyphs
  const head = text === '' ? '' : `${rule}${rule} ${text} `
  const ruleWidth = Math.max(1, visibleWidth(rule))
  return binnacle.paint('accent', head + rule.repeat(Math.max(0, Math.floor((width - visibleWidth(head)) / ruleWidth))))
}
