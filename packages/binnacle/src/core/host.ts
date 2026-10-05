import { capture } from './capture.ts'
import type { Stream } from './capture.ts'
import { Keyboard } from './keyboard.ts'
import type { Terminal } from '../terminal/terminal.ts'

const ALTERNATE_SCREEN_ON = '\x1b[?1049h'
const ALTERNATE_SCREEN_OFF = '\x1b[?1049l'
const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'
const MOUSE_ON = '\x1b[?1000h\x1b[?1006h'
const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l'

export type ProcessEvent = 'exit' | 'SIGTSTP' | 'SIGCONT'

export interface Process {
  on(event: ProcessEvent, listener: () => void): void
  off(event: ProcessEvent, listener: () => void): void
  stop(): void
}

export interface Size {
  readonly columns: number
  readonly rows: number
}

/** The core's hold on the terminal: it takes it, gives it back, and suspends with it. */
export class Host {
  readonly #streams: readonly Stream[]
  readonly #process: Process
  readonly #onInput: (data: string) => void
  readonly #onResize: () => void
  readonly #keyboard: Keyboard
  #terminal: Terminal | undefined
  #holding = false
  #printHeldBack: (() => void) | undefined

  constructor(streams: readonly Stream[], process: Process, onInput: (data: string) => void, onResize: () => void) {
    this.#streams = streams
    this.#process = process
    this.#onInput = onInput
    this.#onResize = onResize
    this.#keyboard = new Keyboard((data) => {
      this.write(data)
    })
    process.on('SIGTSTP', this.suspend)
    process.on('SIGCONT', this.take)
    // A crash exits without unloading the tree, so the core's disposer would never run.
    process.on('exit', this.giveBack)
  }

  /** While binnacle holds the terminal. */
  get size(): Size | undefined {
    return this.#holding ? this.#terminal : undefined
  }

  write(data: string): void {
    this.#terminal?.write(data)
  }

  /** A reply of the terminal to what the keyboard asked, which is no key. */
  answered(sequence: string): boolean {
    return this.#keyboard.answered(sequence)
  }

  open(terminal: Terminal): void {
    this.#terminal = terminal
    this.take()
  }

  readonly take = (): void => {
    if (this.#terminal === undefined || this.#holding) return
    this.#holding = true
    this.#printHeldBack = capture(this.#streams)
    this.#terminal.start(this.#onInput, this.#onResize)
    this.#terminal.write(ALTERNATE_SCREEN_ON + CURSOR_HIDE + MOUSE_ON)
    this.#keyboard.take()
    this.#onResize()
  }

  readonly giveBack = (): void => {
    if (this.#terminal === undefined || !this.#holding) return
    this.#holding = false
    this.#keyboard.giveBack()
    this.#terminal.write(MOUSE_OFF + CURSOR_SHOW + ALTERNATE_SCREEN_OFF)
    this.#terminal.stop()
    this.#printHeldBack?.()
    this.#printHeldBack = undefined
  }

  readonly suspend = (): void => {
    if (!this.#holding) return
    this.giveBack()
    this.#process.stop()
  }

  close(): void {
    this.#process.off('SIGTSTP', this.suspend)
    this.#process.off('SIGCONT', this.take)
    this.#process.off('exit', this.giveBack)
    this.giveBack()
    this.#terminal = undefined
  }
}
