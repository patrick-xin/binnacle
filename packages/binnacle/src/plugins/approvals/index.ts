/**
 * Approvals: what the agent asks to do, in the composer's seat, allowed once
 * or rejected by a key. A built-in plugin, holding only what an author holds:
 * the `binnacle` service, to seat its card where an author could seat one.
 * It answers dsh's `approval/request` waterfall
 * (`dsh:packages/interaction/user-approval/src/types.ts`) for the session's
 * agent alone: the host applies it on a scope of that agent
 * (`dsh:packages/core/scope/src/index.ts#createScope`), so another agent's
 * ask never reaches it — dsh's dispatch is scope-filtered, and what no
 * answerer claims fails closed.
 *
 * While a request stands its card is the newest placement in the composer's
 * slot, so it takes the keyboard, and answering it gives the composer back as
 * it was. A request withdrawn by its signal takes its card back, settled
 * `cancelled` as dsh settles it; the plugin disposed with a request standing
 * settles it `unavailable`, as dsh does when nothing answers.
 */

import type { Context, Events } from '@deepseek-ai/cordis'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { Node } from '../../api.ts'

/** What the waterfall hands an answerer, as dsh declares it on its event map; the package does not export it by name. */
type Asked = Parameters<Events['approval/request']>[0]

/**
 * The card a request is asked with: the tool, why it asks, and what a person can do about it.
 * @param req - the request.
 * @returns the card.
 */
function card(req: Asked): Node {
  const reason = req.displayReason?.en ?? req.reason
  return {
    kind: 'card',
    title: `${req.toolName} asks`,
    edge: 'accent',
    child: {
      kind: 'stack',
      children: [
        ...reason === undefined ? [] : [{ kind: 'text' as const, text: reason }],
        { kind: 'offer', id: 'allow', affordances: [{ kind: 'grant', label: 'allow once' }], child: { kind: 'text', text: 'allow once' } },
        { kind: 'offer', id: 'reject', affordances: [{ kind: 'dismiss', label: 'reject' }], child: { kind: 'text', text: 'reject' } },
      ],
    },
  }
}

/** The Approvals plugin, loaded by the host beside the surface it draws on. */
export const approvals = {
  name: 'approvals',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    const standing = new Set<(outcome: ApprovalOutcome) => void>()
    ctx.effect(() => () => {
      // Each settles and leaves the set; a Set's iteration goes on past what it deletes.
      for (const settle of standing) settle('unavailable')
    }, 'approvals: what still stands, settled as nothing answered')
    ctx.on('approval/request', req => new Promise<ApprovalOutcome>((resolve) => {
      if (req.signal?.aborted === true) {
        resolve('cancelled')
        return
      }
      let unseat: (() => void) | undefined
      const withdrawn = (): void => { settle('cancelled') }
      function settle(outcome: ApprovalOutcome): void {
        if (!standing.delete(settle)) return
        req.signal?.removeEventListener('abort', withdrawn)
        unseat?.()
        resolve(outcome)
      }
      standing.add(settle)
      req.signal?.addEventListener('abort', withdrawn, { once: true })
      unseat = ctx.binnacle.place('composer', {
        kind: 'lines',
        draw: () => card(req),
        invoke: (_region, affordance) => { settle(affordance === 'grant' ? 'allowed-once' : 'rejected') },
      })
    }))
  },
}
