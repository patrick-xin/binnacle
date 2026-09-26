/**
 * The built-in views: how each kind of transcript entry is drawn.
 *
 * Each returns nodes and declares what its content offers; none reads input
 * or holds a pi-tui component.
 * @module binnacle/views/entries
 */

import type { Block, Fact } from '../facts/adapt.ts'
import type { Entry } from '../models/transcript.ts'
import type { Node } from '../ui/node.ts'

/** How a kind of entry is drawn: a built-in view, or one an author registered. */
export type View = (entry: Entry) => Node

/**
 * The text of some blocks, one paragraph each.
 * @param blocks - the blocks.
 * @returns their text.
 */
function textOf(blocks: readonly Block[]): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/**
 * Draw an answer: reasoning folded under a label, text as it was written.
 * @param fact - the answer.
 * @returns what it draws.
 */
function drawAnswer(fact: Extract<Fact, { readonly kind: 'answer' }>): Node {
  const children = fact.blocks.map((block, index): Node => block.kind === 'reasoning'
    ? { kind: 'stack', children: [{ kind: 'text', text: '∴ thinking' }, { kind: 'fold', id: `reasoning:${fact.seq}:${index}`, rows: 0, child: { kind: 'text', text: block.text } }] }
    : { kind: 'text', text: textOf([block]) })
  return { kind: 'stack', children: fact.interrupted ? [...children, { kind: 'text', text: '(interrupted)' }] : children }
}

/**
 * Draw a tool call: what was asked, then whether it is running, failed, or what it returned, folded.
 * @param call - the call.
 * @param result - its result, once it has one.
 * @returns what it draws.
 */
function drawTool(call: Extract<Fact, { readonly kind: 'call' }>, result: Extract<Fact, { readonly kind: 'result' }> | undefined): Node {
  const head: Node = { kind: 'text', text: `${result?.failed === true ? '✗' : '●'} ${call.name} ${call.arguments}` }
  if (result === undefined) return { kind: 'stack', children: [head, { kind: 'text', text: '  running…' }] }
  const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: `  ${result.failure.reason}` }]
  const output: Node = { kind: 'fold', id: `tool:${call.callId}`, rows: 3, child: { kind: 'text', text: textOf(result.blocks) } }
  return { kind: 'stack', children: [head, ...reason, output] }
}

/**
 * Draw one entry.
 * @param entry - the entry.
 * @param views - authors' views, by entry kind or by the name of an authored fact; one for a built-in kind replaces it.
 * @returns what it draws.
 */
export function drawEntry(entry: Entry, views: ReadonlyMap<string, View> = new Map()): Node {
  const registered = views.get(entry.kind === 'authored' ? entry.fact.name : entry.kind)
  if (registered !== undefined) return registered(entry)
  switch (entry.kind) {
    case 'prompt':
      return { kind: 'text', text: `› ${textOf(entry.fact.blocks)}` }
    case 'context':
      return titled(`⋯ added by ${entry.fact.source}`, { kind: 'fold', id: `context:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: textOf(entry.fact.blocks) } })
    case 'answer':
      return drawAnswer(entry.fact)
    case 'tool':
      return drawTool(entry.call, entry.result)
    case 'result':
      return titled(`● result of call ${entry.fact.callId}`, { kind: 'fold', id: `result:${entry.fact.seq}`, rows: 3, child: { kind: 'text', text: textOf(entry.fact.blocks) } })
    case 'authored':
      return titled(`? ${entry.fact.name}`, { kind: 'fold', id: `authored:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: JSON.stringify(entry.fact.data, null, 2) } })
    case 'unknown':
      return titled(`? ${entry.fact.type}`, { kind: 'fold', id: `unknown:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: JSON.stringify(entry.fact.record, null, 2) } })
  }
}

/**
 * A line of title above some content.
 * @param title - the title.
 * @param body - the content.
 * @returns both, stacked.
 */
function titled(title: string, body: Node): Node {
  return { kind: 'stack', children: [{ kind: 'text', text: title }, body] }
}
