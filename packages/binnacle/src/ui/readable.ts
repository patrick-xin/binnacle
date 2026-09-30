import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { Node, Span } from './node.ts'

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
        affordances: node.affordances.map(affordance => affordance.label === undefined ? affordance : { ...affordance, label: treated(affordance.label) }),
        child: readable(node.child),
      }
    case 'ask': {
      const child = readable(node.child)
      return node.title === undefined ? { ...node, child } : { ...node, title: treated(node.title), child }
    }
    case 'show':
      return { ...node, title: node.title.map(readableSpan), child: readable(node.child) }
    case 'part':
    case 'band':
      return { ...node, child: readable(node.child) }
    case 'fold':
      return node.title === undefined
        ? { ...node, child: readable(node.child) }
        : { ...node, title: node.title.map(readableSpan), child: readable(node.child) }
  }
}

function readableSpan(span: Span): Span {
  if (typeof span === 'string') return treated(span)
  if ('mark' in span || 'since' in span) return span
  return { ...span, text: treated(span.text) }
}

function treated(text: string): string {
  const stripped = stripTerminalSequences(text)
  let read = ''
  for (let index = 0; index < stripped.length; index++) {
    const code = stripped.charCodeAt(index)
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code <= 0x7e) || code > 0x9f) read += stripped[index]
    // A carriage return before a newline is the line ending; anywhere else it is drawn ␍.
    else if (code === 0x0d) {
      if (stripped.charCodeAt(index + 1) !== 0x0a) read += '␍'
    }
    else if (code < 0x20) read += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) read += '␡'
    else read += '�'
  }
  return read
}
