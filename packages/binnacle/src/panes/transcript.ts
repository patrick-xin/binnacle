/**
 * The transcript pane: the screen as a pi-tui component, on either of pi-tui's screens.
 *
 * It folds the session's facts into turns as they arrive, holds the UI state,
 * draws the screen at the width pi-tui gives it, and answers a pointer through
 * the gesture table on the screen it last drew, which is the one the person
 * pointed at. On the main screen it never changes a row it has printed
 * ([ADR 12](../../../../docs/adr/0012-on-the-main-screen-a-printed-row-never-changes.md)).
 */

import type { Component, TuiMode, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
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

/** The screen, as a component pi-tui lays out and scrolls. */
export class TranscriptPane implements Component {
  #transcript: Transcript = empty
  readonly #changed: () => void
  readonly #views: () => Views
  #state: UiState = initial
  #draw: DrawScreen = screens()
  #drawn: { readonly width: number, readonly screen: Screen } | undefined
  #on: TuiMode = 'fullscreen'
  #printed: Printed | undefined

  /**
   * @param changed - called when what the pane draws has changed, so the renderer draws a frame.
   * @param views - authors' views as they stand, read at every frame; an entry is drawn again when the views of its key change.
   */
  constructor(changed: () => void, views: () => Views = () => new Map()) {
    this.#changed = changed
    this.#views = views
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
  }

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns on the alternate screen, every line of the transcript as it now draws; on the main screen, what it printed, then what has not settled as it now draws. A new width prints everything again.
   */
  render(width: number): string[] {
    const screen = this.#draw(this.#transcript, this.#state, width, this.#views())
    this.#drawn = { width, screen }
    if (this.#on === 'fullscreen') return [...screen.lines]
    const through = (entries: number): number => entries === 0 ? 0 : screen.ends[entries - 1] ?? screen.lines.length
    const now = settled(this.#transcript)
    const was = this.#printed
    const printed = was === undefined || was.width !== width
      ? { width, entries: now, lines: screen.lines.slice(0, through(now)) }
      : now > was.entries ? { width, entries: now, lines: [...was.lines, ...screen.lines.slice(through(was.entries), through(now))] } : was
    this.#printed = printed
    return [...printed.lines, ...screen.lines.slice(through(printed.entries))]
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

  /** Draw every entry again, as pi-tui asks when the theme changes, on the main screen what it printed included. */
  invalidate(): void {
    this.#draw = screens()
    this.#printed = undefined
  }
}
