import { describe } from '../contract/index.ts'
import type { Fact } from '../facts/adapt.ts'
import type { Node, Span } from '../ui/node.ts'
import { parseNode } from '../ui/node.ts'
import type { Theme } from '../ui/theme.ts'

export function drawPlaced(registration: string, draw: (facts: readonly Fact[]) => Node, facts: readonly Fact[], theme: Theme): Node {
  let returned: unknown
  try {
    returned = draw(facts)
  } catch (error) {
    return refused(`${registration} threw: ${describe(error)}`)
  }
  try {
    return parseNode(returned, theme)
  } catch (error) {
    return refused(`${registration} returned no drawable node: ${describe(error)}`)
  }
}

export function refused(what: string): Node {
  const spans: readonly Span[] = [{ mark: 'problem' }, ` ${what}`]
  return { kind: 'text', text: spans, tone: 'error' }
}
