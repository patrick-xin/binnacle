import type { Terminal } from './terminal.ts'

export class ProcessTerminal implements Terminal {
  // Bound before binnacle captures stdout, so binnacle's own writes reach the terminal.
  readonly #write = process.stdout.write.bind(process.stdout)
  #onInput: ((data: string) => void) | undefined
  #onResize: (() => void) | undefined

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.#onInput = onInput
    this.#onResize = onResize
    process.stdin.setRawMode?.(true)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onInput)
    process.stdin.resume()
    process.stdout.on('resize', onResize)
  }

  stop(): void {
    if (this.#onInput !== undefined) process.stdin.off('data', this.#onInput)
    if (this.#onResize !== undefined) process.stdout.off('resize', this.#onResize)
    this.#onInput = undefined
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
