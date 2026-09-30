import type { Component, TuiMode, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import type { Gesture } from '../contract/index.ts'
import { empty, fold, settled, transcript } from '../models/transcript.ts'
import type { Transcript } from '../models/transcript.ts'
import { answer } from '../ui/answer.ts'
import { under } from '../ui/layout.ts'
import type { LayoutState } from '../ui/layout.ts'
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
  readonly entries: number
  readonly lines: readonly string[]
}

export interface PaneReports {
  readonly inView?: (top: number, height: number) => void
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
  #draw: DrawScreen
  readonly #now: () => number | undefined
  readonly #keys: () => LayoutState['keys']
  #drawn: { readonly width: number, readonly screen: Screen } | undefined
  #on: TuiMode = 'fullscreen'
  // On the main screen the pane never changes a row it has printed.
  #printed: Printed | undefined
  #parked: string | undefined

  constructor(changed: () => void, views: () => Views = () => new Map(), reports: PaneReports = {}, theme: () => Theme = () => binnacleTheme, now: () => number | undefined = () => undefined, keys: () => LayoutState['keys'] = () => undefined) {
    this.#changed = changed
    this.#keys = keys
    this.#draw = screens(keys)
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

  reset(facts: readonly Fact[]): void {
    this.#transcript = transcript(facts)
    this.#draw = screens(this.#keys)
    this.#printed = undefined
    this.#changed()
  }

  drawOn(mode: TuiMode): void {
    this.#on = mode
    if (mode === 'regular') this.#dropPrintedFocus()
    else if (this.#parked !== undefined) {
      this.#state = { ...this.#state, focus: this.#parked }
      this.#parked = undefined
    }
  }

  #dropPrintedFocus(): void {
    const focus = this.#state.focus
    const drawn = this.#drawn
    if (focus === undefined || drawn === undefined) return
    const placed = drawn.screen.regions.find(candidate => candidate.region.id === focus)
    if (placed !== undefined && placed.top < this.#printedThrough(drawn.width, drawn.screen)) this.#park(drawn.screen)
  }

  #park(screen: Screen): void {
    this.#parked = this.#state.focus
    this.#state = act(this.#state, { kind: 'unfocus' }, screen)
  }

  render(width: number): string[] {
    const now = settled(this.#transcript)
    let screen = this.#draw(this.#transcript, this.#state, width, this.#views(), this.#theme(), this.#now())
    if (this.#on === 'regular' && this.#state.focus !== undefined) {
      // Avoid changing already-printed rows.
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

  reveal(): void {
    const drawn = this.#drawn
    const focus = this.#state.focus
    if (drawn === undefined || focus === undefined) return
    const placed = this.#draw(this.#transcript, this.#state, drawn.width, this.#views(), this.#theme(), this.#now()).regions.find(candidate => candidate.region.id === focus)
    if (placed !== undefined) this.#inView(placed.top, placed.height)
  }

  get ticking(): boolean {
    return this.#drawn?.screen.timed === true
  }

  get focused(): boolean {
    return this.#state.focus !== undefined
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = gestureOf(event)
    if (gesture === undefined) return undefined
    const drawn = this.#drawn?.width === event.width ? this.#drawn.screen : this.#draw(this.#transcript, this.#state, event.width, this.#views(), this.#theme(), this.#now())
    const next = answer(this.#state, gesture, under(drawn.regions, event.y, event.x), drawn)
    if (next === undefined || next.state === this.#state) return undefined
    this.#state = next.state
    return { handled: true }
  }

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
          // Main screen can't repaint printed rows, so ask for fullscreen when focus moves there.
          if (this.#on === 'fullscreen') this.#inView(placed.top, placed.height)
          else if (placed.top < this.#printedThrough(drawn.width, screen)) this.#fullscreen(placed.top, placed.height)
        }
      }
      this.#changed()
    }
    return true
  }

  #printedThrough(width: number, screen: Screen): number {
    const printed = this.#printed
    if (printed === undefined || printed.width !== width) return 0
    return printed.entries === 0 ? 0 : screen.ends[printed.entries - 1] ?? screen.lines.length
  }

  invalidate(): void {
    this.#draw = screens(this.#keys)
    this.#printed = undefined
  }
}
