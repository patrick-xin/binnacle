/**
 * A terminal that a test of the core drives: what binnacle writes lands in
 * xterm's emulation, so the screens themselves are the claim, and a test
 * types bytes into it and resizes it.
 * @module binnacle/test/support/terminal
 */
import xterm from '@xterm/headless'
import type { Terminal } from '../../src/terminal/terminal.ts'

export class XtermTerminal implements Terminal {
  readonly #xterm: InstanceType<typeof xterm.Terminal>
  #onInput: ((data: string) => void) | undefined
  #onResize: (() => void) | undefined
  /** Whether binnacle holds the terminal in raw mode. */
  raw = false
  /** Everything binnacle wrote, in order. */
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

  /** Bytes a person typed, or a mouse event the terminal reports. */
  type(data: string): void {
    this.#onInput?.(data)
  }

  /** The window changed size. */
  resize(columns: number, rows: number): void {
    this.#xterm.resize(columns, rows)
    this.#onResize?.()
  }

  /**
   * What the terminal shows, once everything written has landed.
   * @returns which screen is active, each of its rows with trailing spaces cut, and the mouse mode.
   */
  async read(): Promise<{ screen: 'normal' | 'alternate'; rows: string[]; mouse: string }> {
    await new Promise<void>((resolve) => {
      this.#xterm.write('', resolve)
    })
    const buffer = this.#xterm.buffer.active
    const rows: string[] = []
    for (let y = 0; y < this.#xterm.rows; y++) rows.push(buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? '')
    return { screen: buffer.type, rows, mouse: this.#xterm.modes.mouseTrackingMode }
  }
}
