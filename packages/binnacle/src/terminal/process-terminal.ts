/**
 * The terminal of the process binnacle runs in: its stdin and its stdout.
 * pi-tui's own terminal comes with its key decoding, when binnacle reads keys.
 * @module binnacle/terminal/process-terminal
 */
import type { Terminal } from './terminal.ts'

export class ProcessTerminal implements Terminal {
  // Bound when the terminal is made, before binnacle holds back what other code writes to stdout.
  readonly #write = process.stdout.write.bind(process.stdout)
  #onData: ((data: string) => void) | undefined
  #onResize: (() => void) | undefined

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.#onData = onInput
    this.#onResize = onResize
    process.stdin.setRawMode?.(true)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onInput)
    process.stdin.resume()
    process.stdout.on('resize', onResize)
  }

  stop(): void {
    if (this.#onData !== undefined) process.stdin.off('data', this.#onData)
    if (this.#onResize !== undefined) process.stdout.off('resize', this.#onResize)
    this.#onData = undefined
    this.#onResize = undefined
    process.stdin.setRawMode?.(false)
    process.stdin.pause()
  }

  write(data: string): void {
    this.#write(data)
  }

  get columns(): number {
    return process.stdout.columns ?? 80
  }

  get rows(): number {
    return process.stdout.rows ?? 24
  }
}
