/**
 * The terminal binnacle draws on: bytes in, bytes out, and its size.
 * @module binnacle/terminal/terminal
 */

export interface Terminal {
  /**
   * Put the terminal in raw mode and listen to it.
   * @param onInput - each chunk of bytes the terminal sends.
   * @param onResize - the window changed size.
   */
  start(onInput: (data: string) => void, onResize: () => void): void
  /** Leave raw mode, and stop listening. */
  stop(): void
  write(data: string): void
  readonly columns: number
  readonly rows: number
}
