/** Something is always said, even when reading the value throws. */
export function readable(value: unknown): string {
  try {
    return value instanceof Error ? String(value.message) : String(value)
  } catch {
    // A value with no string form, or a message that throws when read: nothing more can be said of it.
    return 'a value binnacle cannot show'
  }
}

import type { ToolResult } from '@deepseek-ai/dsh-tools'
import type { Fact, PresentedCall, PresentedResult } from '../../api.ts'

type Result = Extract<Fact, { readonly kind: 'result' }>

const callCards: ReadonlySet<string> = new Set(['generic', 'terminal', 'diff'])

const resultCards: ReadonlySet<string> = new Set(['generic', 'terminal', 'diff', 'read', 'search', 'web'])

/** What a presenter returned, read as data: the view, or why it cannot be drawn. */
export type Read<T> = { readonly view: T } | { readonly why: string }

/** `undefined` when `presentCall` returned undefined, dsh's word for the generic fallback binnacle's own card is; else the view, or why the value cannot be drawn. */
export function callViewOf(value: unknown): Read<PresentedCall> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return { why: `it is ${value === null ? 'null' : typeof value}` }
  const record = value as Record<string, unknown>
  const card: unknown = record.card
  const title: unknown = record.title
  if (typeof card !== 'string' || !callCards.has(card)) return { why: `${readable(card)} is no card the tool cards draw` }
  if (typeof title !== 'string') return { why: 'a call view needs its title' }
  return { view: { card: card as PresentedCall['card'], title, returned: frozenCopy(value) } }
}

/** `undefined` when `presentResult` returned undefined, dsh's word for keeping the pending title and the raw result content; else the view, or why the value cannot be drawn. */
export function resultViewOf(value: unknown): Read<PresentedResult> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return { why: `it is ${value === null ? 'null' : typeof value}` }
  const record = value as Record<string, unknown>
  const card: unknown = record.card
  const title: unknown = record.title
  const content: unknown = record.content
  if (typeof card !== 'string' || !resultCards.has(card)) return { why: `${readable(card)} is no card the tool cards draw` }
  if (title !== undefined && typeof title !== 'string') return { why: "a result view's title is not text" }
  if (content !== undefined && !Array.isArray(content)) return { why: "a result view's content is not an array of blocks" }
  return {
    view: {
      card: card as PresentedResult['card'],
      ...title === undefined ? {} : { title },
      ...content === undefined ? {} : { content },
      returned: frozenCopy(value),
    },
  }
}

/** Not frozen: the object is the tool's, which may cache or reuse it. */
function frozenCopy(value: object): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(value as Record<string, unknown>) })
}

/** Each later line is indented two columns, so a command written on more than one line does not read as output. */
export function titled(title: string): string {
  const lines = title.split('\n')
  return lines.length === 1 ? title : [lines[0], ...lines.slice(1).map(line => `  ${line}`)].join('\n')
}

/** The result's `content` is rebuilt from its text blocks, a block binnacle cannot read left out; `meta` is as logged. */
export function handedResult(fact: Result): ToolResult {
  return {
    content: fact.blocks.flatMap(block => block.kind === 'unread' ? [] : [block.kind === 'text'
      ? { type: 'text', text: block.text }
      : { type: 'reasoning', text: block.text }]),
    isError: fact.failed,
    ...fact.meta === undefined ? {} : { meta: fact.meta as NonNullable<ToolResult['meta']> },
  }
}

export function textOfBlocks(blocks: Result['blocks']): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/** Whatever is not a block at all is left out. */
export function textOfPresented(content: readonly unknown[]): string {
  return content.flatMap(block => {
    if (typeof block !== 'object' || block === null) return []
    const record = block as Record<string, unknown>
    if ((record.type === 'text' || record.type === 'reasoning') && typeof record.text === 'string') return [record.text]
    return typeof record.type === 'string' ? [`[${record.type}]`] : []
  }).join('\n')
}
