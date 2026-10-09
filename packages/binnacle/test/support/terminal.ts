import xterm from '@xterm/headless'
import type { Terminal } from '../../src/terminal/terminal.ts'

export class XtermTerminal implements Terminal {
  readonly #xterm: InstanceType<typeof xterm.Terminal>
  #onInput: ((data: string) => void) | undefined
  #onResize: (() => void) | undefined
  raw = false
  written = ''

  constructor(columns: number, rows: number) {
    this.#xterm = new xterm.Terminal({ cols: columns, rows, allowProposedApi: true })
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.raw = true
    this.#onInput = onInput
    this.#onResize = onResize
  }

  stop(): void {
    this.raw = false
    this.#onInput = undefined
    this.#onResize = undefined
  }

  write(data: string): void {
    this.written += data
    this.#xterm.write(data)
  }

  get columns(): number {
    return this.#xterm.cols
  }

  get rows(): number {
    return this.#xterm.rows
  }

  type(data: string): void {
    this.#onInput?.(data)
  }

  resize(columns: number, rows: number): void {
    this.#xterm.resize(columns, rows)
    this.#onResize?.()
  }

  async read(): Promise<{ screen: 'normal' | 'alternate'; rows: string[]; mouse: string; cursor: { x: number; y: number } }> {
    // xterm parses writes asynchronously; an empty write's callback runs after every earlier one.
    await new Promise<void>((resolve) => {
      this.#xterm.write('', resolve)
    })
    const buffer = this.#xterm.buffer.active
    const rows: string[] = []
    for (let y = 0; y < this.#xterm.rows; y++) rows.push(buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? '')
    return { screen: buffer.type, rows, mouse: this.#xterm.modes.mouseTrackingMode, cursor: { x: buffer.cursorX, y: buffer.cursorY } }
  }

  /** The palette colour of the text in a cell, or `default`. */
  async colourAt(x: number, y: number): Promise<number | 'default'> {
    await this.read()
    const cell = this.#xterm.buffer.active.getLine(this.#xterm.buffer.active.viewportY + y)?.getCell(x)
    return cell === undefined || cell.isFgDefault() ? 'default' : cell.getFgColor()
  }

  /** How the text in a cell is drawn: its colour, a palette index or `#rrggbb`, and its attributes. */
  async styleAt(
    x: number,
    y: number,
  ): Promise<{ colour: number | string; bold: boolean; dim: boolean; italic: boolean; underline: boolean }> {
    await this.read()
    const cell = this.#xterm.buffer.active.getLine(this.#xterm.buffer.active.viewportY + y)?.getCell(x)
    if (cell === undefined) return { colour: 'default', bold: false, dim: false, italic: false, underline: false }
    const colour = cell.isFgDefault()
      ? 'default'
      : cell.isFgRGB()
        ? `#${cell.getFgColor().toString(16).padStart(6, '0')}`
        : cell.getFgColor()
    return {
      colour,
      bold: cell.isBold() !== 0,
      dim: cell.isDim() !== 0,
      italic: cell.isItalic() !== 0,
      underline: cell.isUnderline() !== 0,
    }
  }

  /** The colour behind the text in a cell: a palette index, `#rrggbb`, or `default`. */
  async backgroundAt(x: number, y: number): Promise<number | string> {
    await this.read()
    const cell = this.#xterm.buffer.active.getLine(this.#xterm.buffer.active.viewportY + y)?.getCell(x)
    if (cell === undefined || cell.isBgDefault()) return 'default'
    return cell.isBgRGB() ? `#${cell.getBgColor().toString(16).padStart(6, '0')}` : cell.getBgColor()
  }

  /** Whether the cell is drawn in inverse video. */
  async inverseAt(x: number, y: number): Promise<boolean> {
    await this.read()
    const cell = this.#xterm.buffer.active.getLine(this.#xterm.buffer.active.viewportY + y)?.getCell(x)
    return cell !== undefined && cell.isInverse() !== 0
  }
}
