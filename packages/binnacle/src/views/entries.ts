/**
 * The built-in views: how each kind of transcript entry is drawn.
 *
 * Each returns nodes and declares what its content offers; none reads input
 * or holds a pi-tui component.
 */

import type { Block, Fact } from '../facts/adapt.ts'
import type { Entry } from '../models/transcript.ts'
import { describe } from '../contract/index.ts'
import { parseNode } from '../ui/node.ts'
import type { Node } from '../ui/node.ts'

/** How a kind of entry is drawn: a built-in view, or one an author registered. */
export type View = (entry: Entry) => Node

/**
 * The text of some blocks, one paragraph each; a block binnacle cannot read is its type in brackets.
 */
function textOf(blocks: readonly Block[]): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/**
 * Draw an answer: reasoning folded under a label, text as it was written.
 */
function drawAnswer(fact: Extract<Fact, { readonly kind: 'answer' }>): Node {
  const children = fact.blocks.map((block, index): Node => block.kind === 'reasoning'
    ? { kind: 'stack', children: [{ kind: 'text', text: '∴ thinking' }, { kind: 'fold', id: `reasoning:${fact.seq}:${index}`, rows: 0, child: { kind: 'text', text: block.text } }] }
    : { kind: 'text', text: textOf([block]) })
  return { kind: 'stack', children: fact.interrupted ? [...children, { kind: 'text', text: '(interrupted)' }] : children }
}

/**
 * Draw a tool call: what was asked, then whether it is running, failed, or what it returned, folded.
 * @param result - its result, once it has one.
 */
function drawTool(call: Extract<Fact, { readonly kind: 'call' }>, result: Extract<Fact, { readonly kind: 'result' }> | undefined): Node {
  const head: Node = { kind: 'text', text: `${result?.failed === true ? '✗' : '●'} ${call.name} ${call.arguments}` }
  if (result === undefined) return { kind: 'stack', children: [head, { kind: 'text', text: '  running…' }] }
  const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: `  ${result.failure.reason}` }]
  const output: Node = { kind: 'fold', id: `tool:${call.callId}`, rows: 3, child: { kind: 'text', text: textOf(result.blocks) } }
  return { kind: 'stack', children: [head, ...reason, output] }
}

/** Every kind of entry binnacle draws; a view registered under one of these names draws that kind, so no authored fact may take one. */
const drawnHere: Readonly<Record<Entry['kind'], true>> = { prompt: true, context: true, answer: true, tool: true, result: true, authored: true, unknown: true }

/**
 * Draw one entry.
 * @param views - authors' views, by entry kind or by the name of an authored fact; one for a built-in kind replaces it.
 * @returns what it draws; the built-in drawing, saying what went wrong, when an author's view throws or returns no node binnacle can lay out, or an authored fact is named as a built-in kind.
 */
export function drawEntry(entry: Entry, views: ReadonlyMap<string, View> = new Map()): Node {
  if (entry.kind === 'authored' && Object.hasOwn(drawnHere, entry.fact.name)) {
    return builtIn(entry, `${entry.fact.name} is a kind binnacle draws; the adapter must give its fact another name`)
  }
  const key = entry.kind === 'authored' ? entry.fact.name : entry.kind
  const registered = views.get(key)
  if (registered === undefined) return builtIn(entry)
  let returned: unknown
  try {
    returned = registered(entry)
  } catch (error) {
    return builtIn(entry, `binnacle.view(${key}) threw: ${describe(error)}`)
  }
  try {
    return parseNode(returned)
  } catch (error) {
    return builtIn(entry, `binnacle.view(${key}) returned no drawable node: ${describe(error)}`)
  }
}

/**
 * Draw one entry as binnacle does.
 * @param problem - what went wrong drawing it otherwise, said under its title, or after it when it has none.
 * @returns what it draws.
 */
function builtIn(entry: Entry, problem?: string): Node {
  switch (entry.kind) {
    case 'prompt':
      return noted({ kind: 'text', text: `› ${textOf(entry.fact.blocks)}` }, problem)
    case 'context':
      return titled(`⋯ added by ${entry.fact.source}`, { kind: 'fold', id: `context:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: textOf(entry.fact.blocks) } }, problem)
    case 'answer':
      return noted(drawAnswer(entry.fact), problem)
    case 'tool':
      return noted(drawTool(entry.call, entry.result), problem)
    case 'result':
      return titled(`● result of call ${entry.fact.callId}`, { kind: 'fold', id: `result:${entry.fact.seq}`, rows: 3, child: { kind: 'text', text: textOf(entry.fact.blocks) } }, problem)
    case 'authored':
      return titled(`? ${entry.fact.name}`, { kind: 'fold', id: `authored:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: shown(entry.fact.data) } }, problem)
    case 'unknown':
      return titled(`? ${entry.fact.type}`, { kind: 'fold', id: `unknown:${entry.fact.seq}`, rows: 0, child: { kind: 'text', text: shown(entry.fact.record) } }, problem ?? entry.fact.problem)
  }
}

/**
 * A line of title above some content, and what went wrong under the title.
 */
function titled(title: string, body: Node, problem: string | undefined): Node {
  return { kind: 'stack', children: problem === undefined ? [{ kind: 'text', text: title }, body] : [{ kind: 'text', text: title }, { kind: 'text', text: `✗ ${problem}` }, body] }
}

/**
 * Content, and what went wrong after it, if anything.
 */
function noted(body: Node, problem: string | undefined): Node {
  return problem === undefined ? body : { kind: 'stack', children: [body, { kind: 'text', text: `✗ ${problem}` }] }
}

/**
 * A value as the fallback shows it: JSON where it can be, what `describe` says where it cannot.
 * @param value - an event's record or an author's data.
 * @returns its text.
 */
function shown(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? describe(value)
  } catch {
    // A cycle, a bigint or a getter that throws has no JSON: say what it is instead.
    return describe(value)
  }
}
