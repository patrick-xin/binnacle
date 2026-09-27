/**
 * The treatment every string a node carries goes through as it is laid out,
 * so no text a view draws acts on the terminal: what clears a screen, writes
 * a clipboard or sets a title is gone, and every control character left is a
 * symbol a person can read.
 */

import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Node, Span } from './node.ts'

/**
 * A node with the strings it carries treated, so the layout can draw what it
 * holds as it is. Every kind of node is named here and none is skipped, so a
 * kind added to `Node` fails to compile until its carried strings are treated
 * too.
 * @param node - the node a view drew.
 * @returns the node, its carried strings readable and inert.
 */
export function readable(node: Node): Node {
  switch (node.kind) {
    case 'blank':
      return node
    case 'markdown':
      return { ...node, text: treated(node.text) }
    case 'text':
      return { ...node, text: typeof node.text === 'string' ? treated(node.text) : node.text.map(readableSpan) }
    case 'stack':
      return { ...node, children: node.children.map(readable) }
    case 'offer':
      return {
        ...node,
        affordances: node.affordances.map(affordance => ({ ...affordance, label: treated(affordance.label) })),
        child: readable(node.child),
      }
    case 'card': {
      const child = readable(node.child)
      return node.title === undefined ? { ...node, child } : { ...node, title: treated(node.title), child }
    }
    case 'fold':
      return { ...node, child: readable(node.child) }
  }
}

/**
 * One span of a text node's line: a text span's text treated, its tone as it was; a mark span left as it is, for the theme's glyph is not a string a view carried.
 * @param span - the span a view drew.
 * @returns the span, its carried text readable and inert.
 */
function readableSpan(span: Span): Span {
  if (typeof span === 'string') return treated(span)
  if ('mark' in span) return span
  return { ...span, text: treated(span.text) }
}

/**
 * A string as a person reads it: pi-tui's own strip removes ANSI, OSC and
 * APC sequences keeping the visible text
 * (`pi:packages/tui/src/utils.ts#stripTerminalSequences`), and every control
 * character left but tab and newline is drawn visibly — a C0 control or DEL
 * as its control picture, a C1 control as `�` — except a carriage return
 * before a newline, which is the line ending and is dropped.
 * @param text - the string as it was carried.
 * @returns the string as it is drawn.
 */
function treated(text: string): string {
  const stripped = stripTerminalSequences(text)
  let read = ''
  for (let index = 0; index < stripped.length; index++) {
    const code = stripped.charCodeAt(index)
    // Tab, newline and every printable character are drawn as they are.
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code <= 0x7e) || code > 0x9f) read += stripped[index]
    // A carriage return before a newline is the line ending; anywhere else it is drawn ␍.
    else if (code === 0x0d) {
      if (stripped.charCodeAt(index + 1) !== 0x0a) read += '␍'
    }
    // A C0 control or DEL is drawn as its control picture, a C1 control as �.
    else if (code < 0x20) read += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) read += '␡'
    else read += '�'
  }
  return read
}
