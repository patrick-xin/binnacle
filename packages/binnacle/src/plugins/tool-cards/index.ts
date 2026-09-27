/**
 * The tool cards: each tool call drawn from what its tool presents — a title
 * saying what the call does, and once it returns, what it returned folded
 * beneath — rather than as its name and raw JSON
 * ([ADR 15](../../../../../docs/adr/0015-a-tool-call-is-drawn-from-what-its-tool-presents.md)).
 *
 * binnacle's first built-in plugin, holding only what an author holds
 * ([ADR 5](../../../../../docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)):
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
import { callViewOf, handedResult, readable, resultViewOf, textOfBlocks } from './presentation.ts'
import { rowFor } from './cards.ts'

/** The tool-cards plugin, loaded by the host beside the surface it draws on. */
export const toolCards = {
  name: 'tool-cards',
  inject: ['binnacle', 'tools'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.binnacle.view('tool', viewOf(ctx.tools))
  },
}

/**
 * The view of a tool entry this plugin registers: the call as its glyph and
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
    if (entry.result === undefined) {
      const head: Node = { kind: 'text', text: [{ text: '●', tone: 'muted' }, ` ${titled(call.title)}`] }
      const waiting: Node = entry.left === undefined
        ? { kind: 'text', text: '  running…', tone: 'muted' }
        : { kind: 'text', text: `  the turn ended without it: ${entry.left}`, tone: 'muted' }
      return { kind: 'stack', children: [head, ...rowFor(call.card).pending(call), waiting] }
    }
    const result = entry.result
    let completed
    if (tool.presentResult !== undefined) {
      try {
        completed = resultViewOf(tool.presentResult(args, handedResult(result)))
      } catch (error) {
        // As a throwing call presenter: the entry is the view beneath's, with what did it said beneath.
        return refused(next(), `${entry.call.name}.presentResult threw: ${readable(error)}`)
      }
      if (completed !== undefined && 'why' in completed) return refused(next(), `${entry.call.name}.presentResult returned no drawable view: ${completed.why}`)
    }
    const shown = completed === undefined ? undefined : completed.view
    const head: Node = { kind: 'text', text: [result.failed === true ? { text: '✗', tone: 'error' } : { text: '●', tone: 'success' }, ` ${titled(shown?.title ?? call.title)}`] }
    const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: `  ${result.failure.reason}`, tone: 'error' }]
    const output: Node = {
      kind: 'fold',
      id: `tool:${entry.call.callId}`,
      rows: 3,
      child: (shown === undefined ? undefined : rowFor(shown.card).folded(shown)) ?? { kind: 'text', text: textOfBlocks(result.blocks) },
    }
    return { kind: 'stack', children: [head, ...reason, output] }
  }
}

/**
 * The card beneath's drawing, with what a presenter did wrong said beneath it, in error.
 * @param beneath - what the view beneath drew.
 * @param what - the tool, the presenter and what went wrong.
 * @returns the drawing a person reads.
 */
function refused(beneath: Node, what: string): Node {
  return { kind: 'stack', children: [beneath, { kind: 'text', text: `✗ ${what}`, tone: 'error' }] }
}

/**
 * A presented title as the head shows it: its first line beside the glyph, and each later line indented two columns beneath it, so a command written on more than one line does not read as output.
 * @param title - the title a presenter gave, however many lines it wrote.
 * @returns the head's text.
 */
function titled(title: string): string {
  const lines = title.split('\n')
  return lines.length === 1 ? title : [lines[0], ...lines.slice(1).map(line => `  ${line}`)].join('\n')
}
