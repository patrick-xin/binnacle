/**
 * The generic card: a titled call, and a completed call that folds the
 * content its tool presented — or the result's own text when it presented
 * none. Every kind with no row of its own draws through this one.
 */

import type { Node } from '../../api.ts'
import type { CardRow } from './cards.ts'
import { textOfPresented, titled } from './presentation.ts'

/** The generic card's row. */
export const genericCard: CardRow = {
  draw: parts => {
    const head: Node = { kind: 'text', text: [parts.mark, ` ${titled(parts.result?.title ?? parts.call.title)}`] }
    if (parts.waiting !== undefined) return { kind: 'stack', children: [head, parts.waiting] }
    const reason: Node[] = parts.reason === undefined ? [] : [{ kind: 'text', text: `  ${parts.reason}`, tone: 'error' }]
    const presented = parts.result?.content === undefined ? undefined : { kind: 'text' as const, text: textOfPresented(parts.result.content) }
    return { kind: 'stack', children: [head, ...reason, parts.fold(presented ?? { kind: 'text', text: parts.resultText })] }
  },
}
