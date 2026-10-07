import type { Context } from '@deepseek-ai/cordis'
import type { Handle, Point } from '../../api.ts'
import { Editor } from '../../terminal/components/editor.ts'
import type { EditorTheme } from '../../terminal/components/editor.ts'
import { CURSOR_MARKER } from '../../terminal/tui.ts'
import { visibleWidth } from '../../terminal/utils.ts'

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
  // The core asks for the lines and the cursor more than once in a draw; the editor renders once until it changes.
  let rendered: { width: number; lines: string[]; cursor: Point | undefined } | undefined
  const changed = (): void => {
    rendered = undefined
  }
  const editor = new Editor(
    {
      requestRender: () => {
        changed()
        placed?.redraw()
      },
      terminal: { rows: ROWS },
    },
    THEME,
  )
  editor.focused = true
  editor.onSubmit = (text) => {
    editor.addToHistory(text)
    ctx.get('binnacleSession')?.send(text)
  }
  // The editor marks its cursor in its lines, as pi-tui's own drawing reads it.
  const drawn = (width: number) => {
    if (rendered?.width === width) return rendered
    const lines = editor.render(width)
    const line = lines.findIndex((text) => text.includes(CURSOR_MARKER))
    const marked = lines[line] ?? ''
    const cursor = line === -1 ? undefined : { line, column: visibleWidth(marked.slice(0, marked.indexOf(CURSOR_MARKER))) }
    rendered = { width, lines: lines.map((text) => text.replace(CURSOR_MARKER, '')), cursor }
    return rendered
  }
  placed = ctx.binnacle.place('composer', {
    lines: (width) => drawn(width).lines,
    cursor: (width) => drawn(width).cursor,
    key: (data) => {
      // pi-tui's editor names its actions `tui.`; a key bound to any other action is not the editor's.
      const actions = ctx.binnacle.gestures.actionsOf(data)
      // The Gesture Table's clear is the draft's to do while there is one; on an empty draft it goes on to the core.
      if (actions.includes('binnacle.clear') && editor.getText() !== '') {
        editor.setText('')
        changed()
        return true
      }
      if (actions.some((action) => !action.startsWith('tui.'))) return false
      // A stored session takes nothing that is sent, and a new one takes nothing until it is open.
      editor.disableSubmit = ctx.get('binnacleSession')?.agent === undefined
      editor.handleInput(data)
      changed()
      return true
    },
  })
}
