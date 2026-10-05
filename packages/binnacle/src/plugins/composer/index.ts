import type { Context } from '@deepseek-ai/cordis'
import type { Handle } from '../../api.ts'
import { coreActionOf } from '../../core/keys.ts'
import { Editor } from '../../terminal/components/editor.ts'
import type { EditorTheme } from '../../terminal/components/editor.ts'

export const name = 'binnacle-composer'

export const inject = ['binnacle'] satisfies (keyof Context)[]

const plain = (text: string): string => text

const THEME: EditorTheme = {
  borderColor: plain,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}

// pi-tui's editor shows at most 30% of the terminal's rows, and at least 5. A plugin does not hold the terminal.
const ROWS = 24

export function apply(ctx: Context): void {
  let placed: Handle | undefined
  const editor = new Editor({ requestRender: () => placed?.redraw(), terminal: { rows: ROWS } }, THEME)
  editor.focused = true
  editor.onSubmit = (text) => {
    editor.addToHistory(text)
  }
  placed = ctx.binnacle.place('composer', {
    lines: (width) => editor.render(width),
    key: (data) => {
      if (coreActionOf(data) !== undefined) return false
      editor.handleInput(data)
      return true
    },
  })
}
