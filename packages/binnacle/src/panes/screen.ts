import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { AffordanceKind, Gesture } from '../contract/index.ts'
import { answer } from '../ui/answer.ts'
import { describe } from '../contract/index.ts'
import { layout, under } from '../ui/layout.ts'
import type { Frame } from '../ui/layout.ts'
import type { Node } from '../ui/node.ts'
import { drawPlaced, refused } from './placed.ts'
import { gestureOf } from '../ui/pointer.ts'
import { initial } from '../ui/state.ts'
import type { UiState } from '../ui/state.ts'
import { binnacleTheme } from '../ui/theme.ts'
import type { Theme } from '../ui/theme.ts'
import { timedIn } from '../views/screen.ts'

/** What the pane reports about the screen it drew, for the host to act on beyond drawing. */
export interface ScreenReports {
  /** Called when what the pane draws has changed, so the renderer draws a frame. */
  readonly changed?: () => void
  /** Something to bring into view: the rows a focused thing covers, on the screen as now drawn. */
  readonly inView?: (top: number, height: number) => void
  /** An offer a person invoked that UI state does not answer — any but `expand` — for the registration to act on. */
  readonly invoked?: (region: string, affordance: AffordanceKind) => void
}

/** What one layout of the screen drew, and all that decides whether it stands. */
interface Laid {
  /** The width it was laid out at. */
  readonly width: number
  /** The UI state it was laid out in, by identity: `act` returns the state itself when nothing changes. */
  readonly state: UiState
  /** The theme it was laid out in, by identity: the registrations hand a new one at each change. */
  readonly theme: Theme
  /** The time it was laid out at, when its drawing says the time since a moment: a later one lays it out again. */
  readonly now: number | undefined
  /** What it drew, and the regions on it. */
  readonly frame: Frame
  /** The regions that offer something, in screen order. */
  readonly focusable: readonly string[]
}

/** A screen a plugin placed, as the pane draws it. */
export class ScreenPane implements Component {
  readonly #facts: () => readonly Fact[]
  readonly #theme: () => Theme
  readonly #now: () => number | undefined
  readonly #changed: () => void
  readonly #inView: (top: number, height: number) => void
  readonly #invoked: (region: string, affordance: AffordanceKind) => void
  #registration: string | undefined
  #draw: ((facts: readonly Fact[]) => Node) | undefined
  #state: UiState = initial
  #laid: Laid | undefined
  #stale = true
  #timed = false
  /** What the last report an invoked offer reached did wrong, drawn beneath what the pane drew until one returns: fenced as a drawing is, so it never takes the surface down. */
  #said: string | undefined

  /**
   * @param facts - the session's facts, as they stand, handed to the placed screen's drawing as they change.
   * @param reports - what the pane reports about the screen it drew; each is optional, and nothing is reported without it.
   * @param theme - the theme as it stands, read at every frame; the screen is laid out again when it changes.
   * @param now - the time, in milliseconds since the epoch, as the host hands it at every frame: what a drawing that
   * says the time since a moment is laid out at, counting up. The pane reads no clock of its own.
   */
  constructor(facts: () => readonly Fact[], reports: ScreenReports = {}, theme: () => Theme = () => binnacleTheme, now: () => number | undefined = () => undefined) {
    this.#facts = facts
    this.#theme = theme
    this.#now = now
    this.#changed = reports.changed ?? (() => {})
    this.#inView = reports.inView ?? (() => {})
    this.#invoked = reports.invoked ?? (() => {})
  }

  /**
   * Draw a placed screen in this pane, or placed lines.
   * @param name - its registration's name.
   * @param screen - how it draws.
   * @param registration - the registration as an author wrote it, to name it by in what went wrong; a placed screen's by default.
   */
  place(name: string, screen: { readonly draw: (facts: readonly Fact[]) => Node }, registration = `binnacle.screen(${name})`): void {
    this.#registration = registration
    this.#draw = screen.draw
    this.#said = undefined
    this.#stale = true
  }

  /** The session's facts have arrived, or been read again: the screen draws again at the next frame. */
  factsChanged(): void {
    this.#stale = true
  }

  /** Whether what it last drew offers something, so it can take focus. */
  get offering(): boolean {
    return (this.#laid?.focusable.length ?? 0) > 0
  }

  /** Whether something on the screen has focus. */
  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  /** Whether what it last drew says the time since a moment, so a later time draws it again: the host's to tick. */
  get ticking(): boolean {
    return this.#timed
  }

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns every line it draws, for the scroll view it sits in; what it last drew, drawn and laid out again only as its facts, its width, what a person opened on it or its registration changed, or — where its drawing says the time since a moment — as that time passes.
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
    if (next?.invoked !== undefined) {
      this.#report(next.invoked.region, next.invoked.affordance)
      return { handled: true }
    }
    if (next === undefined || next.state === this.#state) return undefined
    this.#state = next.state
    this.#changed()
    return { handled: true }
  }

  /**
   * Answer a key gesture through the gesture table, on the screen last drawn:
   * a key lands on the focused region, and, for lines in the composer's seat,
   * on every region beyond it that offers something, top to bottom — so a key
   * bound to a kind answers what the seat offers, whichever offer has focus.
   * @param gesture - the gesture a resolved key became.
   * @param seated - whether these are lines in the composer's seat; a placed screen that is open is read, not answered, so its keys land on focus alone.
   * @returns whether the pane answered it, so the key is consumed; false leaves it to the composer.
   */
  handleKey(gesture: Extract<Gesture, { readonly kind: 'key' }>, seated = false): boolean {
    const drawn = this.#laid
    if (drawn === undefined) return false
    const focus = this.#state.focus
    const focused = drawn.frame.regions.find(placed => placed.region.id === focus)?.region
    const beyond = seated ? drawn.frame.regions.map(placed => placed.region).filter(region => region !== focused && region.affordances.length > 0) : []
    const next = answer(this.#state, gesture, focused === undefined ? beyond : [focused, ...beyond], drawn)
    if (next === undefined) return false
    if (next.invoked !== undefined) this.#report(next.invoked.region, next.invoked.affordance)
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
   * Report an invoked offer to the registration, fenced: what the report —
   * author code — does wrong is drawn beneath what the pane drew, naming its
   * registration, and never takes the surface down. A report that returns
   * draws the lines clean again.
   * @param region - the offer's id, as the registration named it.
   * @param affordance - the kind invoked.
   */
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

  /**
   * What the placed screen draws, fenced.
   * @param theme - the theme it is parsed against.
   * @returns what its drawing returned, or what went wrong, naming its registration.
   */
  #drawn(theme: Theme): Node {
    const draw = this.#draw
    const registration = this.#registration
    if (draw === undefined || registration === undefined) return { kind: 'blank' }
    const drawn = drawPlaced(registration, draw, this.#facts(), theme)
    return this.#said === undefined ? drawn : { kind: 'stack', children: [drawn, refused(this.#said)] }
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
    const now = this.#now()
    if (!this.#stale && laid !== undefined && laid.width === width && laid.state === state && laid.theme === theme && (!this.#timed || laid.now === now)) return laid
    const node = this.#drawn(theme)
    this.#timed = timedIn(node)
    const frame = layout(node, width, { ...state, ...now === undefined ? {} : { now } }, theme)
    const next: Laid = { width, state, theme, now, frame, focusable: frame.regions.filter(placed => placed.region.affordances.length > 0).map(placed => placed.region.id) }
    this.#laid = next
    this.#stale = false
    return next
  }
}
