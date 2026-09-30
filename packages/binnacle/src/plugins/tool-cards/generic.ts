import type { Node } from '../../api.ts'
import type { CardRow } from './cards.ts'
import { textOfPresented, titled } from './presentation.ts'

/** The generic card's row. */
export const genericCard: CardRow = {
  draw: parts => {
    const title = [parts.mark, ` ${titled(parts.result?.title ?? parts.call.title)}`]
    if (parts.waiting !== undefined) return { kind: 'show', title, child: parts.waiting }
    const reason: Node[] = parts.reason === undefined ? [] : [{ kind: 'text', text: parts.reason, tone: 'error' }]
    const presented = parts.result?.content === undefined ? undefined : { kind: 'text' as const, text: textOfPresented(parts.result.content) }
    return { kind: 'show', title, child: { kind: 'stack', children: [...reason, parts.fold(presented ?? { kind: 'text', text: parts.resultText })] } }
  },
}
