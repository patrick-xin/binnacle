/**
 * The transcript pane: the screen as a pi-tui component, on either of pi-tui's screens.
 *
 * It folds the session's facts into turns as they arrive, holds the UI state,
 * draws the screen at the width pi-tui gives it, and answers a pointer or a
 * key through the gesture table on the screen it last drew, which is the one
 * the person acted on. On the main screen it never changes a row it has
 * printed
 * ([ADR 12](../../../../docs/adr/0012-on-the-main-screen-a-printed-row-never-changes.md)).
 */

import type { Component, TuiMode, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { Gesture } from '../contract/index.ts'
import { empty, fold, settled, transcript } from '../models/transcript.ts'
import type { Transcript } from '../models/transcript.ts'
import { meaning } from '../ui/gestures.ts'
import { under } from '../ui/layout.ts'
import { gestureOf } from '../ui/pointer.ts'
import { act, initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import type { Views } from '../views/entries.ts'
import { screens } from '../views/screen.ts'
import type { DrawScreen, Screen } from '../views/screen.ts'

/** What the pane has printed on the main screen. */
interface Printed {
  /** The width it was laid out at. */
  readonly width: number
  /** How many entries it holds, oldest first. */
  readonly entries: number
  /** The rows, as printed. */
  readonly lines: readonly string[]
}

/** What the pane reports about the screen it drew, for the host to act on beyond drawing. */
export interface PaneReports {
  /** Something to bring into view: the rows a focused thing covers, on the screen as now drawn. */
  readonly inView?: (top: number, height: number) => void
  /** A printed entry focus reached on the main screen, asking for the fullscreen, with the rows to bring into view there. */
  readonly fullscreen?: (top: number, height: number) => void
}

/** The screen, as a component pi-tui lays out and scrolls. */
export class TranscriptPane implements Component {
  #transcript: Transcript = empty
  readonly #changed: () => void
  readonly #views: () => Views
  readonly #inView: (top: number, height: number) => void
  readonly #fullscreen: (top: number, height: number) => void
  #state: UiState = initial
  #draw: DrawScreen = screens()
  #drawn: { readonly width: number, readonly screen: Screen } | undefined
  #on: TuiMode = 'fullscreen'
  #printed: Printed | undefined

  /**
   * @param changed - called when what the pane draws has changed, so the renderer draws a frame.
   * @param views - authors' views as they stand, read at every frame; an entry is drawn again when the views of its key change.
   * @param reports - what the pane reports about the screen it drew; each is optional, and nothing is reported without it.
   */
  constructor(changed: () => void, views: () => Views = () => new Map(), reports: PaneReports = {}) {
    this.#changed = changed
    this.#views = views
    this.#inView = reports.inView ?? (() => {})
    this.#fullscreen = reports.fullscreen ?? (() => {})
  }

  /**
   * Add the next fact of the session.
   * @param fact - the fact, in log order.
   */
  push(fact: Fact): void {
    this.#transcript = fold(this.#transcript, fact)
    this.#changed()
  }

  /**
   * Replace every fact, as when the adapters have changed, and draw every entry again, on the main screen what it printed included.
   * @param facts - the whole log, adapted again, in log order.
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
   * terminal keeps the main screen.
   * @param mode - `regular` for the main screen, `fullscreen` for the alternate one; `fullscreen` until told.
   */
  drawOn(mode: TuiMode): void {
    this.#on = mode
    if (mode === 'regular') this.#dropPrintedFocus()
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
    if (placed !== undefined && placed.top < this.#printedThrough(drawn.width, drawn.screen)) {
      this.#state = act(this.#state, { kind: 'unfocus' }, drawn.screen)
    }
  }

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns on the alternate screen, every line of the transcript as it now draws; on the main screen, what it printed, then what has not settled as it now draws. A new width prints everything again.
   */
  render(width: number): string[] {
    const now = settled(this.#transcript)
    let screen = this.#draw(this.#transcript, this.#state, width, this.#views())
    if (this.#on === 'regular' && this.#state.focus !== undefined) {
      // Focus never sits within the rows this render prints: its own row could not be drawn without changing a row already printed.
      const through = (entries: number): number => entries === 0 ? 0 : screen.ends[entries - 1] ?? screen.lines.length
      const placed = screen.regions.find(candidate => candidate.region.id === this.#state.focus)
      if (placed !== undefined && placed.top < through(now)) {
        this.#state = act(this.#state, { kind: 'unfocus' }, screen)
        screen = this.#draw(this.#transcript, this.#state, width, this.#views())
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

  /** Whether something on screen has focus. */
  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  /**
   * Answer the pointer through the gesture table.
   * @param event - pi-tui's event, its row one of this view's lines.
   * @returns handled when the gesture changed the screen; undefined leaves it to pi-tui, which scrolls on the wheel and selects on a drag.
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const drawn = this.#drawn?.width === event.width ? this.#drawn.screen : this.#draw(this.#transcript, this.#state, event.width, this.#views())
    const action = meaning(gesture, under(drawn.regions, event.y, event.x))
    if (action === undefined) return undefined
    const next = act(this.#state, action, drawn)
    if (next === this.#state) return undefined
    this.#state = next
    return { handled: true }
  }

  /**
   * Answer a key gesture through the gesture table, on the screen last drawn:
   * a key lands on the focused region.
   * @param gesture - the gesture a resolved key became.
   * @returns whether the pane answered it, so the key is consumed; false leaves it to the composer.
   */
  handleKey(gesture: Extract<Gesture, { readonly kind: 'key' }>): boolean {
    const drawn = this.#drawn
    if (drawn === undefined) return false
    const focus = this.#state.focus
    const focused = focus === undefined ? undefined : drawn.screen.regions.find(placed => placed.region.id === focus)
    const action = meaning(gesture, focused === undefined ? [] : [focused.region])
    if (action === undefined) return false
    const next = act(this.#state, action, drawn.screen)
    if (next !== this.#state) {
      const moved = next.focus !== undefined && next.focus !== this.#state.focus
      this.#state = next
      if (moved) {
        const screen = this.#draw(this.#transcript, next, drawn.width, this.#views())
        const placed = next.focus === undefined ? undefined : screen.regions.find(candidate => candidate.region.id === next.focus)
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

  /** Draw every entry again, as pi-tui asks when the theme changes, on the main screen what it printed included. */
  invalidate(): void {
    this.#draw = screens()
    this.#printed = undefined
  }
}
