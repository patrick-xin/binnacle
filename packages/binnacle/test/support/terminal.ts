/**
 * The terminals a test of the host fakes, extended rather than rebuilt: one
 * that records what is written and lets a test type into it, one that
 * emulates a terminal through xterm so the screens themselves are the claim,
 * and one that fails as it starts. Only the host turns bytes into screens;
 * everything behind these is real.
 * @module binnacle/test/support/terminal
 */
import type { Terminal } from '@earendil-works/pi-tui'
import xterm from '@xterm/headless'

/** A terminal that records what is written and lets a test type into it. */
export class FakeTerminal implements Terminal {
  written = ''
  started = false
  #onInput: ((data: string) => void) | undefined
  start(onInput: (data: string) => void): void { this.started = true; this.#onInput = onInput }
  stop(): void { this.started = false }
  async drainInput(): Promise<void> {}
  write(data: string): void { this.written += data }
  get columns(): number { return 80 }
  get rows(): number { return 24 }
  get kittyProtocolActive(): boolean { return false }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  type(data: string): void { this.#onInput?.(data) }
}

/**
 * A terminal that emulates one, as pi-tui's own tests do: what binnacle writes
 * lands in xterm's main screen and scrollback, or its alternate screen.
 */
export class XtermTerminal extends FakeTerminal {
  readonly #xterm: InstanceType<typeof xterm.Terminal>
  readonly #columns: number
  readonly #rows: number
  constructor(columns: number, rows: number) {
    super()
    this.#columns = columns
    this.#rows = rows
    this.#xterm = new xterm.Terminal({ cols: columns, rows, allowProposedApi: true })
  }
  override write(data: string): void { super.write(data); this.#xterm.write(data) }
  override get columns(): number { return this.#columns }
  override get rows(): number { return this.#rows }
  /**
   * What the main screen holds, its scrollback first, once everything written has landed.
   * @returns each row, plain, with the empty rows under the last dropped.
   */
  async mainScreen(): Promise<string[]> {
    await new Promise<void>((resolve) => { this.#xterm.write('', resolve) })
    const buffer = this.#xterm.buffer.normal
    const rows = Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true).trimEnd() ?? '')
    while (rows.at(-1) === '') rows.pop()
    return rows
  }
  /**
   * Whether the alternate screen is showing.
   * @returns true when it is.
   */
  async onAlternateScreen(): Promise<boolean> {
    await new Promise<void>((resolve) => { this.#xterm.write('', resolve) })
    return this.#xterm.buffer.active.type === 'alternate'
  }

  /**
   * What the alternate screen holds, once everything written has landed.
   * @returns each row of the window, plain, its trailing spaces dropped.
   * @throws when the alternate screen is not showing.
   */
  async altScreen(): Promise<string[]> {
    await new Promise<void>((resolve) => { this.#xterm.write('', resolve) })
    if (this.#xterm.buffer.active.type !== 'alternate') throw new Error('the alternate screen is not showing')
    return Array.from({ length: this.#rows }, (_, row) => this.#xterm.buffer.active.getLine(row)?.translateToString(true).trimEnd() ?? '')
  }
}

/** A terminal that starts, then fails before it is ready, as one that cannot enter raw mode does. */
export class FailingTerminal extends FakeTerminal {
  override start(onInput: (data: string) => void): void {
    super.start(onInput)
    throw new Error('stdin is not a terminal')
  }
}
