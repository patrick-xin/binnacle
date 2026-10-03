import { ScrollView } from '@earendil-works/pi-tui'
import type { Component } from '@earendil-works/pi-tui'
import type { Fact } from '../facts/adapt.ts'
import { ScreenPane } from '../panes/screen.ts'
import { TranscriptPane } from '../panes/transcript.ts'
import type { LayoutState } from '../ui/layout.ts'
import type { Theme } from '../ui/theme.ts'
import type { Views } from '../views/entries.ts'
import type { Placement, PlacedScreen, Slot, Surface } from '../api.ts'

/** What one place gives the pane seated in it: the keys that reach its gestures, focus brought into view on the place's scroll, and the room an ask at its root is given, from the rows the terminal has. */
interface Given {
  readonly keys: boolean
  readonly inView: boolean
  readonly room?: (rows: number) => number
}

/** The one table of places, read by every seating. */
const places: Readonly<Record<'screen' | Slot, Given>> = {
  transcript: { keys: true, inView: true },
  screen: { keys: true, inView: true },
  'above-composer': { keys: false, inView: false },
  composer: { keys: true, inView: false, room: (rows) => Math.max(12, rows - 10) },
  'below-composer': { keys: false, inView: false },
  dialog: { keys: true, inView: false, room: (rows) => Math.floor((rows * 4) / 5) },
}

/** What the seats ask of the host: a frame drawn now or asked for, a copy written, the fullscreen taken. */
export interface SeatReports {
  /** Ask for a frame: a seated pane changed. */
  readonly render: () => void
  /** Draw a frame now, before what focus brought into view scrolls to it. */
  readonly renderNow: () => void
  /** Write what a person copied: only the host touches the terminal. */
  readonly copy: (text: string) => void
  /** Take the fullscreen: the transcript's focus moved onto rows the main screen has printed. */
  readonly fullscreen: () => void
}

/** What changed where the placed panes stand: the facts they draw, or what they draw with no fact — the theme, the registrations, the key table. */
export type SeatsChange = 'facts' | 'drawn'

/** Every pane the host mounts in a place, and what its place gives it, read from the one table: the keys, and the scroll focus is brought into view on. */
export class Seats {
  /** The transcript pane, seated in the transcript's place. */
  readonly transcript: TranscriptPane
  readonly #reports: SeatReports
  readonly #theme: () => Theme
  readonly #now: () => number | undefined
  readonly #keys: () => LayoutState['keys']
  readonly #rows: () => number
  readonly #facts: () => readonly Fact[]
  readonly #surface: () => Surface
  readonly #screens = new Map<string, ScreenPane>()
  readonly #screenViews = new Map<string, ScrollView>()
  readonly #lines = new Map<Slot, Map<Placement, ScreenPane>>()
  #followed: ScrollView | undefined
  #scroll: ScrollView | undefined

  constructor(
    reports: SeatReports,
    views: () => Views,
    theme: () => Theme,
    now: () => number | undefined,
    keys: () => LayoutState['keys'],
    rows: () => number,
    facts: () => readonly Fact[],
    surface: () => Surface,
  ) {
    this.#reports = reports
    this.#theme = theme
    this.#now = now
    this.#keys = keys
    this.#rows = rows
    this.#facts = facts
    this.#surface = surface
    this.transcript = new TranscriptPane(
      reports.render,
      views,
      { ...this.#inViewOf('transcript'), fullscreen: reports.fullscreen, copy: reports.copy },
      theme,
      now,
      this.#keysOf('transcript'),
    )
  }

  /** The pane seated for a placed screen, built if it is new. */
  screenPane(id: string): ScreenPane {
    const kept = this.#screens.get(id)
    if (kept !== undefined) return kept
    const pane = new ScreenPane(
      this.#facts,
      { ...this.#inViewOf('screen'), copy: this.#reports.copy, changed: this.#reports.render },
      this.#theme,
      this.#now,
      this.#keysOf('screen'),
      this.#roomOf('screen'),
    )
    this.#screens.set(id, pane)
    return pane
  }

  /** The pane seated for lines placed in a slot, built if they are new. */
  linesPane(slot: Slot, placement: Extract<Placement, { readonly kind: 'lines' }>): ScreenPane {
    const inSlot = this.#lines.get(slot) ?? new Map<Placement, ScreenPane>()
    this.#lines.set(slot, inSlot)
    const kept = inSlot.get(placement)
    if (kept !== undefined) return kept
    const pane = new ScreenPane(
      this.#facts,
      {
        ...this.#inViewOf(slot),
        copy: this.#reports.copy,
        changed: this.#reports.render,
        invoked: (region, affordance) => {
          placement.invoke?.(region, affordance)
        },
      },
      this.#theme,
      this.#now,
      this.#keysOf(slot),
      this.#roomOf(slot),
    )
    pane.place(slot, { draw: (drawn) => placement.draw(drawn, this.#surface()) }, `binnacle.place(${slot})`)
    inSlot.set(placement, pane)
    return pane
  }

  /** Unseat the panes of placed screens no longer registered, their scrolls with them. */
  unseatScreens(placed: ReadonlyMap<string, PlacedScreen>): void {
    for (const id of this.#screens.keys()) {
      if (placed.has(id)) continue
      this.#screens.delete(id)
      this.#screenViews.delete(id)
    }
  }

  /** Unseat the lines panes no longer standing on the page. */
  unseatLines(standing: ReadonlySet<Component | undefined>): void {
    for (const [slot, panes] of this.#lines) {
      for (const [placement, pane] of panes) if (!standing.has(pane)) panes.delete(placement)
      if (panes.size === 0) this.#lines.delete(slot)
    }
  }

  /** What is being read where the transcript stands, kept so its scroll survives: the open screen's view, the transcript's, or none. */
  reading(open: string | undefined, transcriptStands: boolean): ScrollView | undefined {
    const reading = open === undefined ? (transcriptStands ? this.#transcriptView() : undefined) : this.#screenView(open)
    // What is being read is what focus is brought into view on.
    this.#scroll = reading
    return reading
  }

  /** The main screen scrolls nothing that is seated, so what focus would be brought into view on goes. */
  onMainScreen(): void {
    this.#scroll = undefined
  }

  /** One walk over the placed panes, each told what changed; the transcript's cache the host calls itself, for its printed rows never change. */
  changed(change: SeatsChange): void {
    for (const pane of this.#seated()) {
      if (change === 'facts') pane.factsChanged()
      else pane.invalidate()
    }
  }

  /** Whether any seated pane draws a moment passing, so the host draws a frame each second while one does. */
  get ticking(): boolean {
    if (this.transcript.ticking) return true
    for (const pane of this.#seated()) if (pane.ticking) return true
    return false
  }

  /** Bring what focus moved to into view on what is being read, once what stands is drawn. */
  readonly #intoView = (top: number, height: number): void => {
    const view = this.#scroll
    if (view === undefined) return
    this.#reports.renderNow()
    if (top < view.scrollTop) view.scrollTo(top)
    else if (top + height > view.scrollTop + view.viewportHeight) view.scrollTo(top + height - view.viewportHeight)
  }

  /** What a place gives the pane seated in it, spread into the pane's reports: focus brought into view, where the place scrolls. */
  #inViewOf(place: 'screen' | Slot): { readonly inView?: (top: number, height: number) => void } {
    return places[place].inView ? { inView: this.#intoView } : {}
  }

  /** The keys a place gives the pane seated in it, as the pane's keys getter takes it. */
  #keysOf(place: 'screen' | Slot): () => LayoutState['keys'] {
    return places[place].keys ? this.#keys : () => undefined
  }

  /** The room a place gives the ask at the root of what its pane draws, read as each frame is laid out. */
  #roomOf(place: 'screen' | Slot): () => LayoutState['room'] {
    const room = places[place].room
    return room === undefined ? () => undefined : () => room(this.#rows())
  }

  #transcriptView(): ScrollView {
    this.#followed ??= new ScrollView(this.transcript, { follow: 'end', primary: true })
    return this.#followed
  }

  #screenView(id: string): ScrollView | undefined {
    const kept = this.#screenViews.get(id)
    if (kept !== undefined) return kept
    const pane = this.#screens.get(id)
    if (pane === undefined) return undefined
    const view = new ScrollView(pane, { primary: true })
    this.#screenViews.set(id, view)
    return view
  }

  *#seated(): IterableIterator<ScreenPane> {
    yield* this.#screens.values()
    for (const panes of this.#lines.values()) yield* panes.values()
  }
}
