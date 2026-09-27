/**
 * The screen pane: a placed screen as a pi-tui component, in the
 * transcript's place on the alternate screen.
 *
 * It draws what the screen's registration returns, with nodes as a view
 * draws, laid out at the width pi-tui gives it — every line, unwindowed,
 * for the scroll view that holds it: pi-tui windows, scrolls, searches and
 * selects what sits in that place, and a placed screen is no exception. A
 * drawing that throws or returns no node binnacle can lay out draws what
 * went wrong, naming its registration, and never takes the surface down.
 */

import type { Component } from '@earendil-works/pi-tui'
import { describe } from '../contract/index.ts'
import type { Fact } from '../facts/adapt.ts'
import { layout } from '../ui/layout.ts'
import type { Node, Span } from '../ui/node.ts'
import { parseNode } from '../ui/node.ts'
import { initial } from '../ui/state.ts'

/** A screen a plugin placed, as the pane draws it. */
export class ScreenPane implements Component {
  readonly #facts: () => readonly Fact[]
  #name: string | undefined
  #draw: ((facts: readonly Fact[]) => Node) | undefined

  /**
   * @param facts - the session's facts, as they stand, handed to the placed screen's drawing at each frame.
   */
  constructor(facts: () => readonly Fact[]) {
    this.#facts = facts
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

  /** Nothing is kept between frames: each one draws the screen again, as its registration and the facts now stand. */
  invalidate(): void {}

  /**
   * Draw the screen.
   * @param width - the columns pi-tui gives it.
   * @returns every line it draws, for the scroll view it sits in.
   */
  render(width: number): string[] {
    return [...layout(this.#drawn(), width, initial).lines]
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
