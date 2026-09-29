/**
 * What a plugin placed, as the panes draw it: the fence every drawing a
 * plugin places is called through, a placed screen's and placed lines'.
 *
 * A drawing is an author's code, so it is fenced: what it throws, or returns
 * that binnacle cannot lay out, is drawn as what went wrong, naming its
 * registration, and never takes the surface down.
 */

import { describe } from '../contract/index.ts'
import type { Fact } from '../facts/adapt.ts'
import type { Node, Span } from '../ui/node.ts'
import { parseNode } from '../ui/node.ts'
import type { Theme } from '../ui/theme.ts'

/**
 * What a placed drawing draws, fenced.
 * @param registration - the registration as an author wrote it, `binnacle.screen(review)`, to name it by in what went wrong.
 * @param draw - the drawing.
 * @param facts - the session's facts, handed to it.
 * @param theme - the theme it is parsed against.
 * @returns what it returned, as a node; or what went wrong, in error.
 */
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

/**
 * What went wrong, as a placement draws it: the problem mark and what did it, in error.
 * @param what - the registration and why it failed.
 * @returns the node that says so.
 */
function refused(what: string): Node {
  const spans: readonly Span[] = [{ mark: 'problem' }, ` ${what}`]
  return { kind: 'text', text: spans, tone: 'error' }
}
