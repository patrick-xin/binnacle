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
 * the entry to the view beneath it, binnacle's own card.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { Node, View } from '../../api.ts'
import { callViewOf, handedResult, resultViewOf, textOfBlocks, textOfPresented } from './presentation.ts'

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
    } catch {
      // What a presenter does wrong never takes the surface down, and the failure is the tool's, not the view's; the entry is the view beneath's.
      return next()
    }
    if (presented === undefined) return next()
    if (entry.result === undefined) {
      const head: Node = { kind: 'text', text: [{ text: '●', tone: 'muted' }, ` ${presented.title}`] }
      const waiting: Node = entry.left === undefined
        ? { kind: 'text', text: '  running…', tone: 'muted' }
        : { kind: 'text', text: `  the turn ended without it: ${entry.left}`, tone: 'muted' }
      return { kind: 'stack', children: [head, waiting] }
    }
    const result = entry.result
    let completed
    if (tool.presentResult !== undefined) {
      try {
        completed = resultViewOf(tool.presentResult(args, handedResult(result)))
      } catch {
        // As a throwing call presenter: the entry is the view beneath's.
        return next()
      }
    }
    const head: Node = { kind: 'text', text: [result.failed === true ? { text: '✗', tone: 'error' } : { text: '●', tone: 'success' }, ` ${completed?.title ?? presented.title}`] }
    const reason: Node[] = result.failure?.reason === undefined ? [] : [{ kind: 'text', text: `  ${result.failure.reason}`, tone: 'error' }]
    const output: Node = {
      kind: 'fold',
      id: `tool:${entry.call.callId}`,
      rows: 3,
      child: { kind: 'text', text: completed?.content === undefined ? textOfBlocks(result.blocks) : textOfPresented(completed.content) },
    }
    return { kind: 'stack', children: [head, ...reason, output] }
  }
}
