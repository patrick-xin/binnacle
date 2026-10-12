import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { CURSOR_MARKER, Editor, visibleWidth } from '../src/index.ts'
import type { EditorTheme, Handle } from '../src/index.ts'
import { agents } from './support/agents.ts'
import { mount } from './support/mount.ts'

const plain = (text: string): string => text
const THEME: EditorTheme = {
  selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
}

const settled = () => new Promise((resolve) => setImmediate(resolve))

const ownComposer = {
  name: 'own-composer',
  inject: ['binnacle'],
  apply: (ctx: Context) => {
    let placed: Handle | undefined
    const editor = new Editor({ requestRender: () => placed?.redraw(), terminal: { rows: 24 } }, THEME)
    editor.focused = true
    editor.onSubmit = (text) => ctx.get('binnacleSession')?.send(text)
    ctx.binnacle.layout('composer', { row: [{ place: 'composer.input' }] })
    placed = ctx.binnacle.place('composer.input', {
      lines: (width) => editor.render(width).map((line) => line.replace(CURSOR_MARKER, '')),
      cursor: (width) => {
        const lines = editor.render(width)
        const line = lines.findIndex((text) => text.includes(CURSOR_MARKER))
        return line === -1 ? undefined : { line, column: visibleWidth(lines[line]!.slice(0, lines[line]!.indexOf(CURSOR_MARKER))) }
      },
      key: (data) => {
        editor.handleInput(data)
        placed?.redraw()
        return true
      },
    })
  },
}

test("an author builds a composer of their own from binnacle's `Editor` and `CURSOR_MARKER`, and a person types a draft and sends it", async () => {
  const dsh = agents()
  const { ctx, ready, terminal } = await mount({ columns: 20, rows: 4, provide: dsh.provide })
  ready()
  await ctx.plugin(ownComposer)
  await settled()
  terminal.type('hi')
  const typed = await terminal.read()
  terminal.type('\r')
  await settled()
  assert.deepEqual(
    [typed.rows.filter((row) => row.trim() !== ''), typed.cursor, dsh.sent],
    [['hi '], { x: 2, y: 3 }, [{ how: 'followup', text: 'hi' }]],
  )
})
