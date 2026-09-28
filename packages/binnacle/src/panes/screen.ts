/**
 * The screen pane: a placed screen as a pi-tui component, in the
 * transcript's place on the alternate screen.
 *
 * It draws what the screen's registration returns, with nodes as a view
 * draws, laid out at the width pi-tui gives it — every line, unwindowed,
 * for the scroll view that holds it: pi-tui windows, scrolls, searches and
 * selects what sits in that place, and a placed screen is no exception. It
 * holds UI state of its own and answers a pointer or a key through the
 * gesture table on the screen it last drew, as the transcript pane does, so
 * a placed screen answers the transcript's gestures with state nothing else
 * touches. A frame costs what changed: the screen is drawn and laid out
 * again as its facts arrive, its width changes, a person opens something on
 * it or its registration changes, and not otherwise. A drawing that throws
 * or returns no node binnacle can lay out draws what went wrong, naming its
 * registration, and never takes the surface down.
 */

import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { Gesture } from '../contract/index.ts'
import { answer } from '../ui/answer.ts'
import { layout, under } from '../ui/layout.ts'
import type { Frame } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import { drawPlaced } from './placed.ts'
import { gestureOf } from '../ui/pointer.ts'
import { initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'

/** What the pane reports about the screen it drew, for the host to act on beyond drawing. */
export interface ScreenReports {
  /** Called when what the pane draws has changed, so the renderer draws a frame. */
  readonly changed?: () => void
  /** Something to bring into view: the rows a focused thing covers, on the screen as now drawn. */
  readonly inView?: (top: number, height: number) => void
}

/** What one layout of the screen drew, and all that decides whether it stands. */
interface Laid {
  /** The width it was laid out at. */
  readonly width: number
  /** The UI state it was laid out in, by identity: `act` returns the state itself when nothing changes. */
  readonly state: UiState
  /** The theme it was laid out in, by identity: the registrations hand a new one at each change. */
  readonly theme: Theme
  /** What it drew, and the regions on it. */
  readonly frame: Frame
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
}

/** A screen a plugin placed, as the pane draws it. */
export class ScreenPane implements Component {
  readonly #facts: () => readonly Fact[]
  readonly #theme: () => Theme
  readonly #changed: () => void
  readonly #inView: (top: number, height: number) => void
  #name: string | undefined
  #draw: ((facts: readonly Fact[]) => Node) | undefined
  #state: UiState = initial
  #laid: Laid | undefined
  #stale = true

  /**
   * @param facts - the session's facts, as they stand, handed to the placed screen's drawing as they change.
   * @param reports - what the pane reports about the screen it drew; each is optional, and nothing is reported without it.
   * @param theme - the theme as it stands, read at every frame; the screen is laid out again when it changes.
   */
  constructor(facts: () => readonly Fact[], reports: ScreenReports = {}, theme: () => Theme = () => binnacleTheme) {
    this.#facts = facts
    this.#theme = theme
    this.#changed = reports.changed ?? (() => {})
    this.#inView = reports.inView ?? (() => {})
  }

  /**
   * Draw a placed screen in this pane.
   * @param name - its registration's name.
   * @param screen - how it draws.
   */
  place(name: string, screen: { readonly draw: (facts: readonly Fact[]) => Node }): void {
    this.#name = name
    this.#draw = screen.draw
    this.#stale = true
  }

  /** The session's facts have arrived, or been read again: the screen draws again at the next frame. */
  factsChanged(): void {
    this.#stale = true
  }

  /** Whether something on the screen has focus. */
  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns every line it draws, for the scroll view it sits in; what it last drew, drawn and laid out again only as its facts, its width or what a person opened on it changed.
   */
  render(width: number): string[] {
    return [...this.laidAt(width, this.#state).frame.lines]
  }

  /**
   * Answer the pointer through the gesture table.
   * @param event - pi-tui's event, its row one of this screen's lines.
   * @returns handled when the gesture changed the screen; undefined leaves it to pi-tui, which scrolls on the wheel and selects on a drag.
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const laid = this.laidAt(event.width, this.#state)
    const next = answer(this.#state, gesture, under(laid.frame.regions, event.y, event.x), laid)
    if (next === undefined || next.state === this.#state) return undefined
    this.#state = next.state
    this.#changed()
    return { handled: true }
  }

  /**
   * Answer a key gesture through the gesture table, on the screen last drawn:
   * a key lands on the focused region.
   * @param gesture - the gesture a resolved key became.
   * @returns whether the pane answered it, so the key is consumed; false leaves it to the composer.
   */
  handleKey(gesture: Extract<Gesture, { readonly kind: 'key' }>): boolean {
    const drawn = this.#laid
    if (drawn === undefined) return false
    const focus = this.#state.focus
    const focused = focus === undefined ? undefined : drawn.frame.regions.find(placed => placed.region.id === focus)
    const next = answer(this.#state, gesture, focused === undefined ? [] : [focused.region], drawn)
    if (next === undefined) return false
    if (next.state !== this.#state) {
      this.#state = next.state
      if (next.focus !== undefined) {
        const screen = this.laidAt(drawn.width, next.state)
        const placed = screen.frame.regions.find(candidate => candidate.region.id === next.focus)
        if (placed !== undefined) this.#inView(placed.top, placed.height)
      }
      this.#changed()
    }
    return true
  }

  /**
   * What the placed screen draws, fenced.
   * @param theme - the theme it is parsed against.
   * @returns what its drawing returned, or what went wrong, naming its registration.
   */
  #drawn(theme: Theme): Node {
    const draw = this.#draw
    const name = this.#name
    if (draw === undefined || name === undefined) return { kind: 'blank' }
    return drawPlaced(`binnacle.screen(${name})`, draw, this.#facts(), theme)
  }

  /** Draw the screen again, as pi-tui asks when the theme changes, or its registration is placed again. */
  invalidate(): void {
    this.#stale = true
  }

  /**
   * What the screen drew at a width in a state and a theme, kept while all of them stand.
   * @param width - the columns.
   * @param state - the UI state.
   * @returns what it drew, and the regions on it.
   */
  private laidAt(width: number, state: UiState): Laid {
    const laid = this.#laid
    const theme = this.#theme()
    if (!this.#stale && laid !== undefined && laid.width === width && laid.state === state && laid.theme === theme) return laid
    const frame = layout(this.#drawn(theme), width, state, theme)
    const next: Laid = { width, state, theme, frame, focusable: frame.regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id) }
    this.#laid = next
    this.#stale = false
    return next
  }
}
