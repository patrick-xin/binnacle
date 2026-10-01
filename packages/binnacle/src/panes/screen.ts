import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { AffordanceKind, Gesture } from '../contract/index.ts'
import { answer } from '../ui/answer.ts'
import { describe } from '../contract/index.ts'
import { extent, layout, under } from '../ui/layout.ts'
import type { Frame, LayoutState } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import { drawPlaced, refused } from './placed.ts'
import { gestureOf } from '../ui/pointer.ts'
import { initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import { timedIn } from '../views/screen.ts'

export interface ScreenReports {
  readonly changed?: () => void
  readonly inView?: (top: number, height: number) => void
  readonly invoked?: (region: string, affordance: AffordanceKind) => void
  /** Write what a person copied to the clipboard: only the host touches the terminal. */
  readonly copy?: (text: string) => void
}

interface Laid {
  readonly width: number
  readonly state: UiState
  readonly theme: Theme
  readonly now: number | undefined
  readonly frame: Frame
  readonly focusable: readonly string[]
}

export class ScreenPane implements Component {
  readonly #facts: () => readonly Fact[]
  readonly #theme: () => Theme
  readonly #now: () => number | undefined
  readonly #keys: () => LayoutState['keys']
  readonly #changed: () => void
  readonly #inView: (top: number, height: number) => void
  readonly #invoked: (region: string, affordance: AffordanceKind) => void
  readonly #copy: (text: string) => void
  #registration: string | undefined
  #draw: ((facts: readonly Fact[]) => Node) | undefined
  #state: UiState = initial
  #laid: Laid | undefined
  #stale = true
  #timed = false
  #said: string | undefined

  constructor(
    facts: () => readonly Fact[],
    reports: ScreenReports = {},
    theme: () => Theme = () => binnacleTheme,
    now: () => number | undefined = () => undefined,
    keys: () => LayoutState['keys'] = () => undefined,
  ) {
    this.#facts = facts
    this.#theme = theme
    this.#now = now
    this.#keys = keys
    this.#changed = reports.changed ?? (() => {})
    this.#inView = reports.inView ?? (() => {})
    this.#invoked = reports.invoked ?? (() => {})
    this.#copy = reports.copy ?? (() => {})
  }

  place(name: string, screen: { readonly draw: (facts: readonly Fact[]) => Node }, registration = `binnacle.screen(${name})`): void {
    this.#registration = registration
    this.#draw = screen.draw
    this.#said = undefined
    this.#stale = true
  }

  factsChanged(): void {
    this.#stale = true
  }

  get offering(): boolean {
    return (this.#laid?.focusable.length ?? 0) > 0
  }

  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  get ticking(): boolean {
    return this.#timed
  }

  render(width: number): string[] {
    return [...this.laidAt(width, this.#state).frame.lines]
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const laid = this.laidAt(event.width, this.#state)
    const next = answer(this.#state, gesture, under(laid.frame.regions, event.y, event.x), laid)
    if (next?.invoked !== undefined) {
      this.#report(next.invoked.region, next.invoked.affordance)
      return { handled: true }
    }
    if (next === undefined || next.state === this.#state) return undefined
    this.#state = next.state
    this.#changed()
    return { handled: true }
  }

  handleKey(gesture: Extract<Gesture, { readonly kind: 'key' }>, seated = false): boolean {
    const drawn = this.#laid
    if (drawn === undefined) return false
    const focus = this.#state.focus
    const focused = drawn.frame.regions.find((placed) => placed.region.id === focus)?.region
    const beyond = seated
      ? drawn.frame.regions.map((placed) => placed.region).filter((region) => region !== focused && region.affordances.length > 0)
      : []
    const next = answer(this.#state, gesture, focused === undefined ? beyond : [focused, ...beyond], drawn)
    if (next === undefined) return false
    const copies =
      next.invoked?.affordance === 'copy'
        ? drawn.frame.regions.find((placed) => placed.region.id === next.invoked?.region)?.region.text
        : undefined
    // The surface answers copy where a region carries its text; an author's own offer of copy reaches its invoke.
    if (copies !== undefined) this.#copy(copies)
    else if (next.invoked !== undefined) this.#report(next.invoked.region, next.invoked.affordance)
    if (next.state !== this.#state) {
      this.#state = next.state
      if (next.focus !== undefined) {
        const screen = this.laidAt(drawn.width, next.state)
        const placed = extent(screen.frame.regions, next.focus)
        if (placed !== undefined) this.#inView(placed.top, placed.height)
      }
      this.#changed()
    }
    return true
  }

  #report(region: string, affordance: AffordanceKind): void {
    try {
      this.#invoked(region, affordance)
      if (this.#said === undefined) return
      this.#said = undefined
    } catch (error) {
      this.#said = `${this.#registration ?? 'binnacle.place'} invoke threw: ${describe(error)}`
    }
    this.#stale = true
    this.#changed()
  }

  #drawn(theme: Theme): Node {
    const draw = this.#draw
    const registration = this.#registration
    if (draw === undefined || registration === undefined) return { kind: 'blank' }
    const drawn = drawPlaced(registration, draw, this.#facts(), theme)
    return this.#said === undefined ? drawn : { kind: 'stack', children: [drawn, refused(this.#said)] }
  }

  invalidate(): void {
    this.#stale = true
  }

  private laidAt(width: number, state: UiState): Laid {
    const laid = this.#laid
    const theme = this.#theme()
    const now = this.#now()
    if (
      !this.#stale &&
      laid !== undefined &&
      laid.width === width &&
      laid.state === state &&
      laid.theme === theme &&
      (!this.#timed || laid.now === now)
    )
      return laid
    const node = this.#drawn(theme)
    this.#timed = timedIn(node)
    const keys = this.#keys()
    const frame = layout(node, width, { ...state, ...(now === undefined ? {} : { now }), ...(keys === undefined ? {} : { keys }) }, theme)
    const next: Laid = {
      width,
      state,
      theme,
      now,
      frame,
      focusable: frame.regions.filter((placed) => placed.region.affordances.length > 0).map((placed) => placed.region.id),
    }
    this.#laid = next
    this.#stale = false
    return next
  }
}
