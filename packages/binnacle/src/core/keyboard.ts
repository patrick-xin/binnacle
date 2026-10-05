import { isKittyProtocolActive, setKittyProtocolActive } from '../terminal/keys.ts'

// Kitty's flags: 1 tells esc and ctrl keys apart, 2 reports releases, 4 reports the shifted and the base-layout key.
const KITTY_FLAGS = 7
// Kitty asks to push the flags before it is asked for them. Every terminal answers the trailing device-attributes query,
// so its answer ends the wait in a terminal that does not know the kitty protocol.
const ASK = `\x1b[?2004h\x1b[>${KITTY_FLAGS}u\x1b[?u\x1b[c`
const KITTY_OFF = '\x1b[<u'
const PASTE_OFF = '\x1b[?2004l'
const MODIFY_OTHER_KEYS_ON = '\x1b[>4;2m'
const MODIFY_OTHER_KEYS_OFF = '\x1b[>4;0m'
const KITTY_FLAGS_REPLY = /^\x1b\[\?(\d+)u$/
const DEVICE_ATTRIBUTES_REPLY = /^\x1b\[\?[\d;]*c$/

/** Bracketed paste and the kitty keyboard protocol, with pi-tui's fallback to modifyOtherKeys. */
export class Keyboard {
  readonly #write: (data: string) => void
  #asked = false
  #modifyOtherKeys = false

  constructor(write: (data: string) => void) {
    this.#write = write
  }

  take(): void {
    this.#asked = true
    this.#write(ASK)
  }

  /** True when the sequence is the terminal's answer, and not a key. */
  answered(sequence: string): boolean {
    const flags = KITTY_FLAGS_REPLY.exec(sequence)?.[1]
    if (flags !== undefined) {
      if (Number(flags) === 0) this.#fallBack()
      else this.#kitty()
      return true
    }
    if (!this.#asked || !DEVICE_ATTRIBUTES_REPLY.test(sequence)) return false
    this.#asked = false
    if (!isKittyProtocolActive()) this.#fallBack()
    return true
  }

  giveBack(): void {
    this.#write(PASTE_OFF + KITTY_OFF + (this.#modifyOtherKeys ? MODIFY_OTHER_KEYS_OFF : ''))
    this.#asked = false
    this.#modifyOtherKeys = false
    setKittyProtocolActive(false)
  }

  #kitty(): void {
    if (this.#modifyOtherKeys) this.#write(MODIFY_OTHER_KEYS_OFF)
    this.#modifyOtherKeys = false
    setKittyProtocolActive(true)
  }

  #fallBack(): void {
    if (this.#modifyOtherKeys || isKittyProtocolActive()) return
    this.#modifyOtherKeys = true
    this.#write(MODIFY_OTHER_KEYS_ON)
  }
}
