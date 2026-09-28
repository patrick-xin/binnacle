/**
 * The tool cards: each tool call drawn from what its tool presents — a title
 * saying what the call does, and once it returns, what it returned folded
 * beneath — rather than as its name and raw JSON.
 *
 * binnacle's first built-in plugin, holding only what an author holds:
 * the author API, type-only; the `binnacle` service, to register a view for
 * the `tool` entry kind; and dsh's `tools` service, to reach the definition
 * that presents each call. Where it cannot draw from a presentation it leaves
 * the entry to the view beneath it, binnacle's own card; a presenter that
 * throws also says so beneath that card, naming the tool, the presenter and
 * why, in error, so the seam never degrades quietly.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { Node, View } from '../../api.ts'
import type { CardParts } from './cards.ts'
import { rowFor } from './cards.ts'
import { callViewOf, handedResult, readable, resultViewOf, textOfBlocks } from './presentation.ts'

/** The tool-cards plugin, loaded by the host beside the surface it draws on. */
export const toolCards = {
  name: 'tool-cards',
  inject: ['binnacle', 'tools'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.view('tool', viewOf(ctx.tools))
  },
}

/**
 * The view of a tool entry this plugin registers: the call as its mark and
 * the title its tool presented, and once it returns, what it returned folded
 * beneath, as its tool presents it.
 * @param tools - dsh's tool registry, reached through the `tools` service.
 * @returns the view.
 */
function viewOf(tools: ToolRuntime): View {
  return (entry, next) => {
    if (entry.kind !== 'tool') return next()
    const tool = tools.get(entry.call.name)
    if (tool === undefined || tool.presentCall === undefined) return next()
    let args: unknown
    try {
      args = JSON.parse(entry.call.arguments)
    } catch {
      // The model's arguments are JSON only usually; a call binnacle cannot read is binnacle's own card's to draw.
      return next()
    }
    let presented
    try {
      presented = callViewOf(tool.presentCall(args))
    } catch (error) {
      // What a presenter does wrong never takes the surface down, and the failure is the tool's, not the view's; the entry is the view beneath's, with what did it said beneath.
      return refused(next(), `${entry.call.name}.presentCall threw: ${readable(error)}`)
    }
    if (presented === undefined) return next()
    if ('why' in presented) return refused(next(), `${entry.call.name}.presentCall returned no drawable view: ${presented.why}`)
    const call = presented.view
    const result = entry.result
    let shown
    if (result !== undefined && tool.presentResult !== undefined) {
      let completed
      try {
        completed = resultViewOf(tool.presentResult(args, handedResult(result)))
      } catch (error) {
        // As a throwing call presenter: the entry is the view beneath's, with what did it said beneath.
        return refused(next(), `${entry.call.name}.presentResult threw: ${readable(error)}`)
      }
      if (completed !== undefined && 'why' in completed) return refused(next(), `${entry.call.name}.presentResult returned no drawable view: ${completed.why}`)
      shown = completed?.view
    }
    const parts: CardParts = {
      call,
      result: shown,
      mark: result === undefined
        ? { mark: 'running' }
        : result.failed === true ? { mark: 'failed' } : { mark: 'done' },
      waiting: result === undefined
        ? (entry.left === undefined
            ? { kind: 'text', text: '  running…', tone: 'muted' }
            : { kind: 'text', text: `  the turn ended without it: ${entry.left}`, tone: 'muted' })
        : undefined,
      reason: result?.failure?.reason,
      resultText: result === undefined ? '' : textOfBlocks(result.blocks),
      // Named as binnacle's own card names its result fold, so a fold a person opened is the plugin's and the card's alike: what they opened stays open when the plugin is disposed, or a presenter throws and the card beneath draws the call. Its rows are the theme's for the tool kind, as binnacle's own card's are.
      fold: (child: Node, rows?: number) => ({ kind: 'fold', id: 'output', ...rows === undefined ? {} : { rows }, child }),
    }
    const kind = shown?.card ?? call.card
    const drawn = rowFor(kind).draw(parts)
    if ('declined' in drawn) return refused(next(), `the ${kind} card could not draw this call: ${drawn.declined}`)
    return drawn
  }
}

/**
 * The card beneath's drawing, with what a presenter did wrong said beneath it: the problem mark and what did it, in error.
 * @param beneath - what the view beneath drew.
 * @param what - the tool, the presenter and what went wrong.
 * @returns the drawing a person reads.
 */
function refused(beneath: Node, what: string): Node {
  return { kind: 'stack', children: [beneath, { kind: 'text', text: [{ mark: 'problem' }, ` ${what}`], tone: 'error' }] }
}
