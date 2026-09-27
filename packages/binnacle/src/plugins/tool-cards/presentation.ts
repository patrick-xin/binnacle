/**
 * What a tool's presenters are handed and what they return, read as data.
 *
 * Presenter code belongs to the tool, not to binnacle, so what it returns is
 * parsed here, where it enters: a view of a kind binnacle does not draw reads
 * as no view at all, and nothing a presenter does can take the surface down.
 * The shapes it returns are dsh's presentation vocabulary
 * (`dsh:packages/core/tools/src/presentation.ts`); this module never imports
 * it at run time, only narrows what was already read off a definition. The
 * head a presented title draws is read here too, for every row that draws
 * one.
 */

/**
 * A thrown presenter's error, or a value one returned, as a person reads it:
 * an error's message, or the value's string form, and something still said
 * even when reading that throws.
 * @param value - what a presenter threw, or returned where a shape was asked.
 * @returns its text.
 */
export function readable(value: unknown): string {
  try {
    return value instanceof Error ? String(value.message) : String(value)
  } catch {
    // A value with no string form, or a message that throws when read: nothing more can be said of it.
    return 'a value binnacle cannot show'
  }
}

import type { ToolResult } from '@deepseek-ai/dsh-tools'
import type { Fact } from '../../api.ts'

/** A completed call's result, as the transcript holds it. */
type Result = Extract<Fact, { readonly kind: 'result' }>

/** The card kinds a call may be presented as. */
const callCards: ReadonlySet<string> = new Set(['generic', 'terminal', 'diff'])

/** The card kinds a result may be presented as. */
const resultCards: ReadonlySet<string> = new Set(['generic', 'terminal', 'diff', 'read', 'search', 'web'])

/** A call as its tool presented it, read as data. */
export interface PresentedCall {
  /** Which card the tool declared for the call. */
  readonly card: 'generic' | 'terminal' | 'diff'
  /** What this call does, as the tool titled it: drawn as the card's head, its first line beside the glyph and each later line indented two columns beneath it. */
  readonly title: string
  /** The object the presenter returned, read-only and unread beyond the fields above: a row reads its kind's own fields here, parsing them where it draws, as data from code binnacle does not own. */
  readonly returned: Readonly<Record<string, unknown>>
}

/** What a presenter returned, read as data: the view, or why it cannot be drawn. */
export type Read<T> = { readonly view: T } | { readonly why: string }

/**
 * Read what a tool's call presenter returned.
 * @param value - what `presentCall` returned.
 * @returns the view it returned; `undefined` when it returned undefined, dsh's word for the generic fallback binnacle's own card is; or why the value cannot be drawn.
 */
export function callViewOf(value: unknown): Read<PresentedCall> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return { why: `it is ${value === null ? 'null' : typeof value}` }
  const record = value as Record<string, unknown>
  const card: unknown = record.card
  const title: unknown = record.title
  if (typeof card !== 'string' || !callCards.has(card)) return { why: `${readable(card)} is no card the tool cards draw` }
  if (typeof title !== 'string') return { why: 'a call view needs its title' }
  return { view: { card: card as PresentedCall['card'], title, returned: Object.freeze(value) as Readonly<Record<string, unknown>> } }
}

/** A result as its tool presented it, read as data. */
export interface PresentedResult {
  /** Which card the tool declared for the completed call. */
  readonly card: 'generic' | 'terminal' | 'diff' | 'read' | 'search' | 'web'
  /** The title the completed call reads as, when the tool presented one; the call's own title when it did not. Drawn as the head, as a call title is. */
  readonly title?: string
  /** The content the completed call folds beneath it, when the tool presented some; the result's own text when it did not. */
  readonly content?: readonly unknown[]
  /** The object the presenter returned, read-only and unread beyond the fields above: a row reads its kind's own fields here, parsing them where it draws, as data from code binnacle does not own. */
  readonly returned: Readonly<Record<string, unknown>>
}

/** Every card kind dsh's presentation vocabulary names, on a call or on a result. */
export type CardKind = PresentedCall['card'] | PresentedResult['card']

/**
 * Read what a tool's result presenter returned.
 * @param value - what `presentResult` returned.
 * @returns the view it returned; `undefined` when it returned undefined, dsh's word for keeping the pending title and the raw result content; or why the value cannot be drawn.
 */
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
      returned: Object.freeze(value) as Readonly<Record<string, unknown>>,
    },
  }
}

/**
 * A presented title as a head shows it: its first line beside the glyph, and each later line indented two columns beneath it, so a command written on more than one line does not read as output.
 * @param title - the title a presenter gave, however many lines it wrote.
 * @returns the head's text.
 */
export function titled(title: string): string {
  const lines = title.split('\n')
  return lines.length === 1 ? title : [lines[0], ...lines.slice(1).map(line => `  ${line}`)].join('\n')
}

/**
 * What a completed call's presenter is handed: the result's `content` rebuilt
 * from its text blocks, a block binnacle cannot read left out, whether it
 * failed, and its `meta` as logged.
 * @param fact - the result, as the transcript holds it.
 * @returns the result dsh's `presentResult` takes.
 */
export function handedResult(fact: Result): ToolResult {
  return {
    content: fact.blocks.flatMap(block => block.kind === 'unread' ? [] : [block.kind === 'text'
      ? { type: 'text', text: block.text }
      : { type: 'reasoning', text: block.text }]),
    isError: fact.failed,
    ...fact.meta === undefined ? {} : { meta: fact.meta as NonNullable<ToolResult['meta']> },
  }
}

/**
 * The text a result's own blocks fold to: one paragraph each, a block binnacle cannot read as its type in brackets.
 * @param blocks - the result's blocks, as the transcript holds them.
 * @returns their text.
 */
export function textOfBlocks(blocks: Result['blocks']): string {
  return blocks.map(block => block.kind === 'unread' ? `[${block.type}]` : block.text).join('\n')
}

/**
 * The text presented content folds to: one paragraph per block binnacle can
 * read, a block it cannot as its type in brackets, and whatever is not a
 * block at all left out.
 * @param content - the blocks a tool's presenter returned.
 * @returns their text.
 */
export function textOfPresented(content: readonly unknown[]): string {
  return content.flatMap(block => {
    if (typeof block !== 'object' || block === null) return []
    const record = block as Record<string, unknown>
    if ((record.type === 'text' || record.type === 'reasoning') && typeof record.text === 'string') return [record.text]
    return typeof record.type === 'string' ? [`[${record.type}]`] : []
  }).join('\n')
}
