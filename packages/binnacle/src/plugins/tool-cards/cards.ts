import type { CardKind, CardParts, CardRow, Node } from '../../api.ts'
import { readable } from './presentation.ts'

/** A kind with no rows draws through `generic`'s; `bottom` is binnacle's own card, beneath the last row. */
export function drawCard(rows: (kind: CardKind) => readonly CardRow[], kind: CardKind, parts: CardParts, bottom: () => Node): Node {
  const own = rows(kind)
  const drawnAs: CardKind = own.length > 0 ? kind : 'generic'
  const stack = own.length > 0 ? own : rows('generic')
  const at = (height: number): Node => {
    const row = stack[height - 1]
    if (row === undefined) return bottom()
    let drawn: unknown
    let declined: string | undefined
    let shown: boolean
    try {
      drawn = row.draw(parts)
      declined = typeof drawn === 'object' && drawn !== null && 'declined' in drawn ? readable(drawn.declined) : undefined
      shown = typeof drawn === 'object' && drawn !== null && 'kind' in drawn && drawn.kind === 'show'
    } catch (error) {
      return refused(at(height - 1), `binnacle.card(${drawnAs}) threw: ${readable(error)}`)
    }
    if (declined !== undefined) return refused(at(height - 1), `the ${kind} card could not draw this call: ${declined}`)
    if (!shown) return refused(at(height - 1), `binnacle.card(${drawnAs}) returned no show`)
    return drawn as Node
  }
  return at(stack.length)
}

export function refused(beneath: Node, what: string): Node {
  return { kind: 'stack', children: [beneath, { kind: 'text', text: [{ mark: 'problem' }, ` ${what}`], tone: 'error' }] }
}
