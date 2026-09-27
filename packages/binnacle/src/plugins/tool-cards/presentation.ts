/**
 * What a tool's presenters are handed and what they return, read as data.
 *
 * Presenter code belongs to the tool, not to binnacle, so what it returns is
 * parsed here, where it enters: a view of a kind binnacle does not draw reads
 * as no view at all, and nothing a presenter does can take the surface down.
 * The shapes it returns are dsh's presentation vocabulary
 * (`dsh:packages/core/tools/src/presentation.ts`); this module never imports
 * it at run time, only narrows what was already read off a definition.
 */

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
  /** What this call does, as the tool titled it; one line, however the tool wrote it. */
  readonly title: string
}

/**
 * Read what a tool's call presenter returned.
 * @param value - what `presentCall` returned.
 * @returns the view it returned, or `undefined` when it returned nothing binnacle draws: not an object, a card binnacle does not draw in this slice, or no title.
 */
export function callViewOf(value: unknown): PresentedCall | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const card: unknown = record.card
  const title: unknown = record.title
  if (typeof card !== 'string' || !callCards.has(card)) return undefined
  if (typeof title !== 'string') return undefined
  return { card: card as PresentedCall['card'], title }
}

/** A result as its tool presented it, read as data. */
export interface PresentedResult {
  /** Which card the tool declared for the completed call. */
  readonly card: 'generic' | 'terminal' | 'diff' | 'read' | 'search' | 'web'
  /** The title the completed call reads as, when the tool presented one; the call's own title when it did not. */
  readonly title?: string
  /** The content the completed call folds beneath it, when the tool presented some; the result's own text when it did not. */
  readonly content?: readonly unknown[]
}

/**
 * Read what a tool's result presenter returned.
 * @param value - what `presentResult` returned.
 * @returns the view it returned, or `undefined` when it returned nothing binnacle draws: not an object, a card binnacle does not draw in this slice, a title that is not one line of text, or content that is not an array of blocks.
 */
export function resultViewOf(value: unknown): PresentedResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const card: unknown = record.card
  const title: unknown = record.title
  const content: unknown = record.content
  if (typeof card !== 'string' || !resultCards.has(card)) return undefined
  if (title !== undefined && typeof title !== 'string') return undefined
  if (content !== undefined && !Array.isArray(content)) return undefined
  return {
    card: card as PresentedResult['card'],
    ...title === undefined ? {} : { title },
    ...content === undefined ? {} : { content },
  }
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
