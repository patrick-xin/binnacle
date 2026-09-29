import type { Component, TuiMode, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { Gesture } from '../contract/index.ts'
import { empty, fold, settled, transcript } from '../models/transcript.ts'
import type { Transcript } from '../models/transcript.ts'
import { answer } from '../ui/answer.ts'
import { under } from '../ui/layout.ts'
import { gestureOf } from '../ui/pointer.ts'
import { act, initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import type { Views } from '../views/entries.ts'
import { screens } from '../views/screen.ts'
import type { DrawScreen, Screen } from '../views/screen.ts'

interface Printed {
  readonly width: number
  /** How many entries it holds, oldest first. */
  readonly entries: number
  readonly lines: readonly string[]
}

/** What the pane reports about the screen it drew, for the host to act on beyond drawing. */
export interface PaneReports {
  /** Something to bring into view: the rows a focused thing covers, on the screen as now drawn. */
  readonly inView?: (top: number, height: number) => void
  /** A printed entry focus reached on the main screen, asking for the fullscreen, with the rows to bring into view there. */
  readonly fullscreen?: (top: number, height: number) => void
}

export class TranscriptPane implements Component {
  #transcript: Transcript = empty
  readonly #changed: () => void
  readonly #views: () => Views
  readonly #theme: () => Theme
  readonly #inView: (top: number, height: number) => void
  readonly #fullscreen: (top: number, height: number) => void
  #state: UiState = initial
  #draw: DrawScreen = screens()
  readonly #now: () => number | undefined
  #drawn: { readonly width: number, readonly screen: Screen } | undefined
  #on: TuiMode = 'fullscreen'
  // On the main screen the pane never changes a row it has printed.
  #printed: Printed | undefined
  /** Focus the main screen dropped from a printed entry, given back when the fullscreen is. */
  #parked: string | undefined

  /**
   * @param changed - called when what the pane draws has changed, so the renderer draws a frame.
   * @param views - read at every frame; an entry is drawn again when the views of its key change.
   * @param theme - read at every frame; every entry is laid out again when it changes.
   * @param now - the time, in milliseconds since the epoch, as the host hands it at every frame: what an entry that draws the time since a moment is laid out at. The pane reads no clock of its own.
   */
  constructor(changed: () => void, views: () => Views = () => new Map(), reports: PaneReports = {}, theme: () => Theme = () => binnacleTheme, now: () => number | undefined = () => undefined) {
    this.#changed = changed
    this.#now = now
    this.#views = views
    this.#theme = theme
    this.#inView = reports.inView ?? (() => {})
    this.#fullscreen = reports.fullscreen ?? (() => {})
  }

  push(fact: Fact): void {
    this.#transcript = fold(this.#transcript, fact)
    this.#changed()
  }

  /**
   * Replace every fact, as when the adapters have changed, and draw every entry again, on the main screen what it printed included.
   */
  reset(facts: readonly Fact[]): void {
    this.#transcript = transcript(facts)
    this.#draw = screens()
    this.#printed = undefined
    this.#changed()
  }

  /**
   * Draw for one of pi-tui's screens from the next frame on. What it printed
   * on the main screen is kept while it draws on the alternate one, as the
   * terminal keeps the main screen, and so is where focus was: focus the main
   * screen dropped from a printed entry comes back with the fullscreen.
   * @param mode - `regular` for the main screen, `fullscreen` for the alternate one; `fullscreen` until told.
   */
  drawOn(mode: TuiMode): void {
    this.#on = mode
    if (mode === 'regular') this.#dropPrintedFocus()
    else if (this.#parked !== undefined) {
      this.#state = { ...this.#state, focus: this.#parked }
      this.#parked = undefined
    }
  }

  /**
   * Drop focus that sits within the rows printed on the main screen, which a switch to it finds: its row
   * could not be drawn there without changing a row already printed.
   */
  #dropPrintedFocus(): void {
    const focus = this.#state.focus
    const drawn = this.#drawn
    if (focus === undefined || drawn === undefined) return
    const placed = drawn.screen.regions.find(candidate => candidate.region.id === focus)
    if (placed !== undefined && placed.top < this.#printedThrough(drawn.width, drawn.screen)) this.#park(drawn.screen)
  }

  // Drops focus the main screen cannot draw, keeping where it was for the fullscreen.

  #park(screen: Screen): void {
    this.#parked = this.#state.focus
    this.#state = act(this.#state, { kind: 'unfocus' }, screen)
  }

  /**
   * @returns on the alternate screen, every line of the transcript as it now draws; on the main screen, what it printed, then what has not settled as it now draws. A new width prints everything again.
   */
  render(width: number): string[] {
    const now = settled(this.#transcript)
    let screen = this.#draw(this.#transcript, this.#state, width, this.#views(), this.#theme(), this.#now())
    if (this.#on === 'regular' && this.#state.focus !== undefined) {
      // Focus never sits within the rows this render prints: its own row could not be drawn without changing a row already printed.
      const through = (entries: number): number => entries === 0 ? 0 : screen.ends[entries - 1] ?? screen.lines.length
      const placed = screen.regions.find(candidate => candidate.region.id === this.#state.focus)
      if (placed !== undefined && placed.top < through(now)) {
        this.#park(screen)
        screen = this.#draw(this.#transcript, this.#state, width, this.#views(), this.#theme(), this.#now())
      }
    }
    this.#drawn = { width, screen }
    if (this.#on === 'fullscreen') return [...screen.lines]
    const through = (entries: number): number => entries === 0 ? 0 : screen.ends[entries - 1] ?? screen.lines.length
    const was = this.#printed
    const printed = was === undefined || was.width !== width
      ? { width, entries: now, lines: screen.lines.slice(0, through(now)) }
      : now > was.entries ? { width, entries: now, lines: [...was.lines, ...screen.lines.slice(through(was.entries), through(now))] } : was
    this.#printed = printed
    return [...printed.lines, ...screen.lines.slice(through(printed.entries))]
  }

  /** Report the rows focus sits on, to be brought into view, as when the fullscreen gives it back; nothing when nothing has focus. */
  reveal(): void {
    const drawn = this.#drawn
    const focus = this.#state.focus
    if (drawn === undefined || focus === undefined) return
    const placed = this.#draw(this.#transcript, this.#state, drawn.width, this.#views(), this.#theme(), this.#now()).regions.find(candidate => candidate.region.id === focus)
    if (placed !== undefined) this.#inView(placed.top, placed.height)
  }

  /** Whether what it last drew holds the time since a moment, so a later time draws it again: the host's to tick. */
  get ticking(): boolean {
    return this.#drawn?.screen.timed === true
  }

  /** Whether something on screen has focus. */
  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  /**
   * @returns handled when the gesture changed the screen; undefined leaves it to pi-tui, which scrolls on the wheel and selects on a drag.
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const drawn = this.#drawn?.width === event.width ? this.#drawn.screen : this.#draw(this.#transcript, this.#state, event.width, this.#views(), this.#theme(), this.#now())
    const next = answer(this.#state, gesture, under(drawn.regions, event.y, event.x), drawn)
    if (next === undefined || next.state === this.#state) return undefined
    this.#state = next.state
    return { handled: true }
  }

  /**
   * A key lands on the focused region. Any key forgets focus the main screen
   * parked, so the fullscreen gives it back only to a person who did nothing
   * else in between.
   * @returns whether the pane answered it, so the key is consumed; false leaves it to the composer.
   */
  handleKey(gesture: Extract<Gesture, { readonly kind: 'key' }>): boolean {
    this.#parked = undefined
    const drawn = this.#drawn
    if (drawn === undefined) return false
    const focus = this.#state.focus
    const focused = focus === undefined ? undefined : drawn.screen.regions.find(placed => placed.region.id === focus)
    const next = answer(this.#state, gesture, focused === undefined ? [] : [focused.region], drawn.screen)
    if (next === undefined) return false
    if (next.state !== this.#state) {
      this.#state = next.state
      if (next.focus !== undefined) {
        const screen = this.#draw(this.#transcript, next.state, drawn.width, this.#views(), this.#theme(), this.#now())
        const placed = screen.regions.find(candidate => candidate.region.id === next.focus)
        if (placed !== undefined) {
          // On the fullscreen the focused thing is brought into view; on the main screen, focus that reaches a printed entry asks for the fullscreen.
          if (this.#on === 'fullscreen') this.#inView(placed.top, placed.height)
          else if (placed.top < this.#printedThrough(drawn.width, screen)) this.#fullscreen(placed.top, placed.height)
        }
      }
      this.#changed()
    }
    return true
  }

  /**
   * The rows printed on the main screen, among the rows of the screen given; 0 when nothing was printed at its width,
   * as after a resize, when the next render prints everything again.
   */
  #printedThrough(width: number, screen: Screen): number {
    const printed = this.#printed
    if (printed === undefined || printed.width !== width) return 0
    return printed.entries === 0 ? 0 : screen.ends[printed.entries - 1] ?? screen.lines.length
  }

  invalidate(): void {
    this.#draw = screens()
    this.#printed = undefined
  }
}
