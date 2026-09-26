/**
 * The transcript view: the screen as a pi-tui component.
 *
 * It holds the session's facts and the UI state, draws the screen at the
 * width pi-tui gives it, and answers a pointer through the gesture table. It
 * lives in the host because it is where the screen meets pi-tui's renderer.
 * @module binnacle/host/transcript-view
 */

import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import { meaning } from '../ui/gestures.ts'
import { under } from '../ui/layout.ts'
import { gestureOf } from '../ui/pointer.ts'
import { act, initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import type { View } from '../views/entries.ts'
import { screen } from '../views/screen.ts'

/** The screen, as a component pi-tui lays out and scrolls. */
export class TranscriptView implements Component {
  readonly #facts: Fact[] = []
  readonly #changed: () => void
  readonly #views: () => ReadonlyMap<string, View>
  #state: UiState = initial

  /**
   * @param changed - called when what the view draws has changed, so the renderer draws a frame.
   * @param views - authors' views as they stand, read at each frame.
   */
  constructor(changed: () => void, views: () => ReadonlyMap<string, View> = () => new Map()) {
    this.#changed = changed
    this.#views = views
  }

  /**
   * Add the next fact of the session.
   * @param fact - the fact, in log order.
   */
  push(fact: Fact): void {
    this.#facts.push(fact)
    this.#changed()
  }

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns every line of the transcript.
   */
  render(width: number): string[] {
    return [...screen(this.#facts, this.#state, width, this.#views()).lines]
  }

  /**
   * Answer the pointer through the gesture table.
   * @param event - pi-tui's event, its row one of this view's lines.
   * @returns handled when the gesture changed the screen; undefined leaves it to pi-tui, which scrolls on the wheel and selects on a drag.
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const drawn = screen(this.#facts, this.#state, event.width, this.#views())
    const action = meaning(gesture, under(drawn.regions, event.y))
    if (action === undefined) return undefined
    const next = act(this.#state, action, drawn)
    if (next === this.#state) return undefined
    this.#state = next
    return { handled: true }
  }

  /** Nothing is cached between frames. */
  invalidate(): void {}
}
