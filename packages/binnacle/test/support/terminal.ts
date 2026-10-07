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

  /** Whether the cell is drawn in inverse video. */
  async inverseAt(x: number, y: number): Promise<boolean> {
    await this.read()
    const cell = this.#xterm.buffer.active.getLine(this.#xterm.buffer.active.viewportY + y)?.getCell(x)
    return cell !== undefined && cell.isInverse() !== 0
  }
}
