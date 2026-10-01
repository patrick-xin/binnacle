import type { Context, Events } from '@deepseek-ai/cordis'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { Node } from '../../api.ts'

type Asked = Parameters<Events['approval/request']>[0]

function card(req: Asked): Node {
  const reason = req.displayReason?.en ?? req.reason
  return {
    kind: 'ask',
    title: `${req.toolName} asks`,
    edge: 'accent',
    child: {
      kind: 'stack',
      children: [
        ...(reason === undefined ? [] : [{ kind: 'text' as const, text: reason }]),
        { kind: 'offer', id: 'allow', affordances: [{ kind: 'grant', label: 'allow once' }], child: { kind: 'text', text: 'allow once' } },
        { kind: 'offer', id: 'reject', affordances: [{ kind: 'dismiss', label: 'reject' }], child: { kind: 'text', text: 'reject' } },
      ],
    },
  }
}

export const approvals = {
  name: 'approvals',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    const standing = new Set<(outcome: ApprovalOutcome) => void>()
    ctx.effect(
      () => () => {
        // Set iteration proceeds past deletions, so all pending requests settle.
        for (const settle of standing) settle('unavailable')
      },
      'approvals: what still stands, settled as nothing answered',
    )
    ctx.on(
      'approval/request',
      (req) =>
        new Promise<ApprovalOutcome>((resolve) => {
          if (req.signal?.aborted === true) {
            resolve('cancelled')
            return
          }
          let unseat: (() => void) | undefined
          const withdrawn = (): void => {
            settle('cancelled')
          }
          function settle(outcome: ApprovalOutcome): void {
            if (!standing.delete(settle)) return
            req.signal?.removeEventListener('abort', withdrawn)
            unseat?.()
            resolve(outcome)
          }
          standing.add(settle)
          req.signal?.addEventListener('abort', withdrawn, { once: true })
          // Card takes keyboard as newest composer placement; answering unseats it.
          unseat = ctx.binnacle.place('composer', {
            kind: 'lines',
            draw: () => card(req),
            invoke: (_region, affordance) => {
              settle(affordance === 'grant' ? 'allowed-once' : 'rejected')
            },
          })
        }),
    )
  },
}
