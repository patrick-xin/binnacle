import type { Context } from '@deepseek-ai/cordis'
import type { Handle, Point } from '../../api.ts'
import { gestureTable } from '../../core/gestures.ts'
import { createModel } from '../../core/model.ts'
import { Editor } from '../../terminal/components/editor.ts'
import type { EditorTheme } from '../../terminal/components/editor.ts'
import { CURSOR_MARKER } from '../../terminal/tui.ts'
import { visibleWidth } from '../../terminal/utils.ts'

export const name = 'binnacle-composer'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** The state of the model `composer`: the draft as it would be sent, a large paste's content in full. */
export interface ComposerState {
  text: string
}

const INPUT = 'composer.input'
const SUBMIT = 'tui.input.submit'
const NEW_LINE = 'tui.input.newLine'
const PASTE_START = '\x1b[200~'

const plain = (text: string): string => text

const THEME: EditorTheme = {
  borderColor: plain,
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}

// pi-tui's editor shows at most 30% of the terminal's rows, and at least 5. A plugin does not hold the terminal.
const ROWS = 24

// The sequences that pi-tui's editor takes as a new line though they match none of its keys: terminals send them for shift+enter.
const newLineFallback = (data: string): boolean =>
  (data.charCodeAt(0) === 10 && data.length > 1) ||
  data === '\x1b\r' ||
  data === '\x1b[13;2~' ||
  (data.length > 1 && data.includes('\x1b') && data.includes('\r'))

// Submit and new line are the composer's actions, so the editor is given none of their keys.
const editorOwn = (action: string): boolean => action.startsWith('tui.') && action !== SUBMIT && action !== NEW_LINE

export function apply(ctx: Context): void {
  const { binnacle } = ctx
  let placed: Handle | undefined
  // The core asks for the lines and the cursor more than once in a draw; the editor renders once until it changes.
  let rendered: { width: number; lines: string[]; cursor: Point | undefined } | undefined
  const changed = (): void => {
    rendered = undefined
  }
  const edited = (): void => {
    changed()
    placed?.redraw()
  }
  const editor = new Editor({ requestRender: edited, terminal: { rows: ROWS } }, THEME)
  editor.focused = true
  editor.onSubmit = (text) => {
    editor.addToHistory(text)
    ctx.get('binnacleSession')?.send(text)
  }

  const draft = createModel<ComposerState>({ text: '' })
  binnacle.model('composer', draft)
  // The editor keeps the cursor and the paste markers, so only a text that differs from its own is set on it, and its own changes never loop back.
  editor.onChange = () => {
    const text = editor.getExpandedText()
    if (draft.state.text === text) return
    draft.set((state) => {
      state.text = text
    })
  }
  ctx.effect(
    () =>
      draft.watch(() => {
        if (draft.state.text === editor.getExpandedText()) return
        editor.setText(draft.state.text)
        edited()
      }),
    'binnacle-composer: the editor shows the draft that is set',
  )

  binnacle.action('composer.send', {
    keys: gestureTable.getKeys(SUBMIT),
    place: INPUT,
    description: 'Send the draft as a prompt, or steer the turn that runs',
    run: () => {
      // A stored session takes nothing that is sent, and a new one takes nothing until it is open.
      if (ctx.get('binnacleSession')?.agent === undefined) return
      const { line, col } = editor.getCursor()
      // pi-tui's fallback for a terminal that cannot tell shift+enter from enter.
      if (editor.getLines()[line]?.[col - 1] === '\\') {
        editor.handleBackspace()
        binnacle.run('composer.newline')
        return
      }
      if (editor.getExpandedText().trim() === '') return
      editor.submitValue()
      edited()
    },
  })
  binnacle.action('composer.newline', {
    keys: gestureTable.getKeys(NEW_LINE),
    place: INPUT,
    description: 'Make a new line in the draft',
    run: () => {
      editor.insertTextAtCursor('\n')
      edited()
    },
  })
  binnacle.action('binnacle.clear', {
    place: INPUT,
    description: 'Clear the draft',
    // On an empty draft, the key goes on to the core's clear, which quits when it is pressed twice.
    enabled: () => editor.getText() !== '',
    run: () => {
      editor.setText('')
      edited()
    },
  })
  binnacle.layout('composer', { row: [{ place: INPUT, size: 'fill' }] })

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
  placed = binnacle.place(INPUT, {
    lines: (width) => drawn(width).lines,
    cursor: (width) => drawn(width).cursor,
    key: (data) => {
      if (!data.startsWith(PASTE_START)) {
        const actions = binnacle.gestures.actionsOf(data)
        // ctrl+j's sequence is also enter's, and pi-tui's editor makes a new line before it submits.
        const newLine =
          (actions.includes('composer.newline') && actions.includes('composer.send')) ||
          (newLineFallback(data) && actions.every((action) => action.startsWith('tui.')))
        if (newLine) {
          binnacle.run('composer.newline')
          return true
        }
        // A key bound to any action but the editor's own, the core's or an author's, goes on to it.
        if (!actions.every(editorOwn)) return false
      }
      editor.handleInput(data)
      changed()
      return true
    },
  })
}
