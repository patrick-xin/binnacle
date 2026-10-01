/**
 * A node in a UI state, as a component `drawText` draws, so a test's lines
 * pass the width guard the terminal's own drawing is held to.
 * @module binnacle/test/support/drawn
 */
import type { Component } from '@earendil-works/pi-tui'
import type { Node } from '../../src/ui/node.ts'
import { layout } from '../../src/ui/layout.ts'
import type { LayoutState } from '../../src/ui/layout.ts'

/**
 * A node in a UI state, as a component: laid out anew at each width it is
 * drawn, through the real layout, so what a test reads back is what the
 * terminal would be given.
 * @param node - what to draw.
 * @param state - the UI state it is drawn in.
 * @returns the component.
 */
export function componentOf(node: Node, state: LayoutState): Component {
  return { render: (width) => [...layout(node, width, state).lines], invalidate: () => {} }
}
