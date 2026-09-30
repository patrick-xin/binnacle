import type { CardRow, Node } from '../../api.ts'
import { textOfPresented, titled } from './presentation.ts'

/** A second or more in whole seconds past a minute, as a running call counts; under a minute to a tenth. */
function spent(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export const genericCard: CardRow = {
  draw: parts => {
    const head = [parts.mark, ` ${titled(parts.result?.title ?? parts.call.title)}`] as const
    const title = parts.took === undefined || parts.took < 1000 ? head : [...head, { text: ` · took ${spent(parts.took)}`, tone: 'muted' } as const]
    if (parts.waiting !== undefined) return { kind: 'show', title, child: parts.waiting }
    const reason: Node[] = parts.reason === undefined ? [] : [{ kind: 'text', text: parts.reason, tone: 'error' }]
    const presented = parts.result?.content === undefined ? undefined : { kind: 'text' as const, text: textOfPresented(parts.result.content) }
    return { kind: 'show', title, child: { kind: 'stack', children: [...reason, parts.fold(presented ?? { kind: 'text', text: parts.resultText })] } }
  },
}
