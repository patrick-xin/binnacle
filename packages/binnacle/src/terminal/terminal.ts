export interface Terminal {
  /** Enters raw mode. */
  start(onInput: (data: string) => void, onResize: () => void): void
  /** Leaves raw mode. */
  stop(): void
  write(data: string): void
  readonly columns: number
  readonly rows: number
}
