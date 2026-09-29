/**
 * Draw to text: what a component shows at a width, as the lines a person
 * reads — no terminal, no styling — so a view, a layout or a whole screen is
 * asserted as lines.
 * @module binnacle/test/support/draw
 */
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui'
import type { Component } from '@earendil-works/pi-tui'

/**
 * Draw a component at a width.
 * @param component - what to draw.
 * @param width - the columns it is given.
 * @returns each line it draws, without styling or trailing spaces.
 * @throws when a line is wider than `width`, which pi-tui's renderer crashes on.
 */
export function drawText(component: Component, width: number): string[] {
  return component.render(width).map((line, index) => {
    const text = stripTerminalSequences(line)
    const columns = visibleWidth(line)
    if (columns > width) throw new Error(`line ${index} is ${columns} columns wide, over the ${width} it was given: ${text}`)
    return text.trimEnd()
  })
}
