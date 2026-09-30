import type { Context } from '@deepseek-ai/cordis'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { Node, View } from '../../api.ts'
import type { CardParts } from './cards.ts'
import { rowFor } from './cards.ts'
import { callViewOf, handedResult, readable, resultViewOf, textOfBlocks } from './presentation.ts'

export const name = 'tool-cards'

/** `tools` is dsh's registry, whose definitions present each call. */
export const inject = ['binnacle', 'tools'] satisfies (keyof Context)[]

export function apply(ctx: Context): void {
  ctx.binnacle.view('tool', viewOf(ctx.tools))
}

/** Without a presentation it leaves the entry to binnacle's card, beneath which a presenter's failure is named. */
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
      // What a presenter does wrong never takes the surface down; the entry is the view beneath's, with the failure said beneath.
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
            ? { kind: 'text', text: ['running ', { since: entry.call.time }], tone: 'muted' }
            : { kind: 'text', text: `the turn ended without it: ${entry.left}`, tone: 'muted' })
        : undefined,
      reason: result?.failure?.reason,
      resultText: result === undefined ? '' : textOfBlocks(result.blocks),
      // Named as binnacle's own card names its result fold, so a fold a person opened stays open when the plugin is disposed or a presenter throws and the card beneath draws the call.
      fold: (child: Node, rows?: number) => ({
        kind: 'part',
        part: { kind: 'output', tool: entry.call.name, text: result === undefined ? '' : textOfBlocks(result.blocks) },
        child: { kind: 'fold', id: 'output', ...rows === undefined ? {} : { rows }, child },
      }),
    }
    const kind = shown?.card ?? call.card
    const drawn = rowFor(kind).draw(parts)
    if ('declined' in drawn) return refused(next(), `the ${kind} card could not draw this call: ${drawn.declined}`)
    return drawn
  }
}

function refused(beneath: Node, what: string): Node {
  return { kind: 'stack', children: [beneath, { kind: 'text', text: [{ mark: 'problem' }, ` ${what}`], tone: 'error' }] }
}
