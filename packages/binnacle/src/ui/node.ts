/**
 * The nodes a view draws with: data, never a render callback.
 *
 * A view returns a node; the ui lays it out with pi-tui at a width. So a view,
 * built-in or an author's, never holds a pi-tui component, and a change in
 * how pi-tui draws reaches every view at once.
 * @module binnacle/ui/node
 */

import type { Affordance } from '../contract/index.ts'

/** Something a view draws. */
export type Node =
  | {
    readonly kind: 'text'
    /** What it says; wrapped at the width it is given. */
    readonly text: string
  }
  | {
    readonly kind: 'stack'
    /** What it draws, top to bottom. */
    readonly children: readonly Node[]
  }
  | {
    readonly kind: 'offer'
    /** The region's id; stable while its content is on screen. */
    readonly id: string
    /** What the content offers, primary first. */
    readonly affordances: readonly Affordance[]
    /** The content. */
    readonly child: Node
  }
  | {
    readonly kind: 'fold'
    /** The region's id; what `expand` opens and folds. */
    readonly id: string
    /** How many rows it shows while folded. */
    readonly rows: number
    /** The content. */
    readonly child: Node
  }
