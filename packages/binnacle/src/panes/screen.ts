/**
 * The screen pane: a placed screen as a pi-tui component, on whatever screen
 * the person is on.
 *
 * It draws what the screen's registration returns, with nodes as a view
 * draws, laid out at the width pi-tui gives it, and windows it to the rows it
 * is given: a placed screen takes the whole of the screen, so what it draws
 * is padded to cover it, and what is taller than it is scrolled. A drawing
 * that throws or returns no node binnacle can lay out draws what went wrong,
 * naming its registration, and never takes the surface down.
 */

import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import { describe } from '../contract/index.ts'
import type { Fact } from '../facts/adapt.ts'
import { layout } from '../ui/layout.ts'
import type { Node, Span } from '../ui/node.ts'
import { parseNode } from '../ui/node.ts'
import type { ScreenScroll } from '../ui/keys.ts'
import { initial } from '../ui/state.ts'

/** A screen a plugin placed, as the pane draws it. */
export class ScreenPane implements Component {
  readonly #changed: () => void
  readonly #facts: () => readonly Fact[]
  readonly #rows: () => number
  #name: string | undefined
  #draw: ((facts: readonly Fact[]) => Node) | undefined
  #lines: readonly string[] = []
  #scrollTop = 0

  /**
   * @param changed - called when what the pane draws has changed, so the renderer draws a frame.
   * @param facts - the session's facts, as they stand, handed to the placed screen's drawing.
   * @param rows - the rows the screen covers.
   */
  constructor(changed: () => void, facts: () => readonly Fact[], rows: () => number) {
    this.#changed = changed
    this.#facts = facts
    this.#rows = rows
  }

  /**
   * Draw a placed screen in this pane.
   * @param name - its registration's name.
   * @param screen - how it draws.
   */
  place(name: string, screen: { readonly draw: (facts: readonly Fact[]) => Node }): void {
    this.#name = name
    this.#draw = screen.draw
  }

  /** Scroll the screen, keeping it within its content. */
  scrollBy(scroll: ScreenScroll): void {
    const rows = this.#rows()
    // A page keeps a few of the rows it showed, as pi-tui's own viewport scrolls a page.
    const by: Record<ScreenScroll, number> = {
      'page.up': -(Math.max(1, rows - 4)),
      'page.down': Math.max(1, rows - 4),
      'half.up': -Math.max(1, Math.floor(rows / 2)),
      'half.down': Math.max(1, Math.floor(rows / 2)),
      'line.up': -1,
      'line.down': 1,
      top: -Number.MAX_SAFE_INTEGER,
      end: Number.MAX_SAFE_INTEGER,
    }
    this.#scrollTop += by[scroll]
    this.#clamped()
    this.#changed()
  }

  /** Bring the scroll back within the content as it now stands, which also forgets scroll that content growing outgrew. */
  #clamped(): void {
    const most = Math.max(0, this.#lines.length - this.#rows())
    this.#scrollTop = Math.min(Math.max(0, this.#scrollTop), most)
  }

  /**
   * Answer the pointer: the wheel scrolls the screen, as pi-tui's own viewports scroll, and the pane claims it; anything else is not the screen's.
   * @param event - pi-tui's event.
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== 'wheel') return undefined
    this.#scrollTop += event.wheelDelta ?? 0
    this.#clamped()
    this.#changed()
    return { handled: true }
  }

  /**
   * Nothing is kept between frames but where the screen is scrolled, which is the person's doing, not a cache; the
   * next frame draws the screen again as its registration and the facts now stand.
   */
  invalidate(): void {}

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns the rows the screen covers, from where it is scrolled, padded to cover them all.
   */
  render(width: number): string[] {
    this.#lines = layout(this.#drawn(), width, initial).lines
    this.#clamped()
    const rows = this.#rows()
    const shown = this.#lines.slice(this.#scrollTop, this.#scrollTop + rows)
    while (shown.length < rows) shown.push('')
    return shown
  }

  /**
   * What the placed screen draws, fenced: what its drawing returned as a node, or what went wrong, naming its registration, in error.
   */
  #drawn(): Node {
    const draw = this.#draw
    const name = this.#name
    if (draw === undefined || name === undefined) return { kind: 'blank' }
    let returned: unknown
    try {
      returned = draw(this.#facts())
    } catch (error) {
      return this.#refused(`binnacle.screen(${name}) threw: ${describe(error)}`)
    }
    try {
      return parseNode(returned)
    } catch (error) {
      return this.#refused(`binnacle.screen(${name}) returned no drawable node: ${describe(error)}`)
    }
  }

  /**
   * What went wrong, as a screen draws it: the problem mark and what did it, in error.
   * @param what - the registration and why it failed.
   */
  #refused(what: string): Node {
    const spans: readonly Span[] = [{ mark: 'problem' }, ` ${what}`]
    return { kind: 'text', text: spans, tone: 'error' }
  }
}
