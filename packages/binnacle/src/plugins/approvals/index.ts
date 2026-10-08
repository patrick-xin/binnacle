import type { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Part } from '../../index.ts'
import { toPlainText } from '../../index.ts'
import { queueOf } from '../requests/index.ts' // Author Gap #177
import type { Standing } from '../requests/index.ts' // Author Gap #177
import { visibleWidth } from '../../terminal/utils.ts' // Author Gap #176

export const name = 'binnacle-approvals'

export const inject = ['binnacle'] satisfies (keyof Context)[]

const RULE = '─'

interface Choice {
  readonly label: string
  readonly outcome: ApprovalOutcome
}

// The Choices are dsh's outcomes; dsh has no "always", so binnacle has none.
const CHOICES: readonly Choice[] = [
  { label: 'Allow once', outcome: 'allowed-once' },
  { label: 'Reject', outcome: 'rejected' },
]

// The arguments are capped before they wrap, so a Request's lines are the same at every width and a click keeps its line.
const MOST_LINES = 12

interface Asked extends Standing {
  readonly title: string
  readonly why: string | undefined
  readonly argumentLines: readonly string[]
  marked: number
  withdrawn: () => void
  readonly done: (outcome: ApprovalOutcome) => void
}

function ruleWith(title: string, width: number): string {
  return title + RULE.repeat(Math.max(0, width - visibleWidth(title)))
}

function titleOf(req: ApprovalRequest, chatAgent: object): string {
  const tool = toPlainText(req.toolName)
  return req.agent === chatAgent ? `── ${tool} needs approval ──` : `── ${tool} needs approval (${toPlainText(req.agent.id)}) ──`
}

function whyOf(req: ApprovalRequest): string | undefined {
  const why = req.displayReason?.en ?? req.reason
  return why === undefined ? undefined : toPlainText(why)
}

function argumentLinesOf(req: ApprovalRequest, events: readonly SessionEvent[]): string[] {
  if (req.callId === undefined) return []
  const call = events.find((event): event is SessionEvent<'tool/call'> => event.type === 'tool/call' && event.data.callId === req.callId)
  if (call === undefined) return []
  let text: string
  try {
    text = JSON.stringify(JSON.parse(call.data.arguments), null, 2)
  } catch {
    text = call.data.arguments
  }
  const lines = text.split('\n').map(toPlainText)
  if (lines.length <= MOST_LINES) return lines
  return [...lines.slice(0, MOST_LINES), `… and ${lines.length - MOST_LINES} more lines`]
}

export function apply(ctx: Context): void {
  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  ctx.inject(['binnacleSession'], (scope) => {
    const chat = scope.binnacleSession
    // A stored session has no agent to answer for, and dsh fails closed as before.
    if (chat.agent === undefined) return
    const chatAgent = chat.agent
    const queue = queueOf(chat)
    const binnacle = scope.binnacle
    const standing: Asked[] = []
    scope.effect(
      () => () => {
        // Each Request leaves the queue before it is answered, so the queue never places one through a plugin that unloads.
        const mine = standing.splice(0)
        queue.settled(...mine)
        for (const request of mine) request.done('unavailable')
      },
      'binnacle-approvals: what still stands, answered as unavailable',
    )
    const answer = (request: Asked, outcome: ApprovalOutcome): void => {
      const at = standing.indexOf(request)
      if (at === -1) return
      standing.splice(at, 1)
      queue.settled(request)
      request.done(outcome)
    }
    const partOf = (request: Asked): Part => {
      const choicesFrom = 1 + (request.why === undefined ? 0 : 1) + request.argumentLines.length
      return {
        lines: (width) => {
          const lines = [ruleWith(request.title, width)]
          if (request.why !== undefined) lines.push(request.why)
          lines.push(...request.argumentLines)
          CHOICES.forEach((choice, index) => lines.push(`${index === request.marked ? '›' : ' '} ${choice.label}`))
          lines.push(RULE.repeat(Math.max(0, width)))
          return lines
        },
        key: (data) => {
          const actions = scope.binnacle.gestures.actionsOf(data)
          if (actions.includes('tui.select.cancel')) answer(request, 'rejected')
          else if (actions.includes('tui.select.confirm')) answer(request, CHOICES[request.marked]!.outcome)
          else if (actions.includes('tui.select.up')) {
            request.marked = (request.marked + CHOICES.length - 1) % CHOICES.length
          } else if (actions.includes('tui.select.down')) {
            request.marked = (request.marked + 1) % CHOICES.length
          }
          // Every other key does nothing while the Request takes the composer's keys.
          return true
        },
        click: (at) => {
          const choice = at.line - choicesFrom
          if (choice < 0 || choice >= CHOICES.length) return false
          answer(request, CHOICES[choice]!.outcome)
          return true
        },
      }
    }
    // The listener is tagged with the Chat's agent, so it answers that agent and each agent under it, and it goes when the plugin unloads.
    const tagged = createScope(scope, chatAgent)
    tagged.ctx.on('approval/request', (req: ApprovalRequest) => {
      // The signal can abort before the waterfall dispatches, as dsh's ApprovalService defers the dispatch: the Request is withdrawn already.
      if (req.signal?.aborted) return Promise.resolve('cancelled')
      return new Promise<ApprovalOutcome>((resolve) => {
        let answered = false
        const request: Asked = {
          title: titleOf(req, chatAgent),
          why: whyOf(req),
          argumentLines: argumentLinesOf(req, chat.events),
          marked: 0,
          // The Part closes over the Request, so it is set here and not in its field, before the Request is shown.
          part: undefined as unknown as Part,
          place: (part) => binnacle.place('composer', part),
          withdrawn: () => answer(request, 'cancelled'),
          done: (outcome) => {
            if (answered) return
            answered = true
            req.signal?.removeEventListener('abort', request.withdrawn)
            resolve(outcome)
          },
        }
        request.part = partOf(request)
        standing.push(request)
        queue.add(request)
        req.signal?.addEventListener('abort', request.withdrawn, { once: true })
      })
    })
  })
}
