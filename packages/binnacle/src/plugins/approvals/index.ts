import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalChoice, ApprovalRequest, Handle, Part } from '../../api.ts'
import { drawKind } from '../requests/old-rows.ts'
import { visibleWidth } from '../../terminal/utils.ts'

export const name = 'binnacle-approvals'

export const inject = ['binnacle', 'binnacleRequests'] satisfies (keyof Context)[]

const RULE = '─'

interface Choice {
  readonly label: string
  readonly outcome: ApprovalChoice
}

const CHOICES: readonly Choice[] = [
  { label: 'Allow once', outcome: 'allowed-once' },
  { label: 'Reject', outcome: 'rejected' },
]

function ruleWith(title: string, width: number): string {
  return title + RULE.repeat(Math.max(0, width - visibleWidth(title)))
}

function titleOf(request: ApprovalRequest): string {
  return request.agent === undefined ? `── ${request.tool} needs approval ──` : `── ${request.tool} needs approval (${request.agent}) ──`
}

function answer(request: ApprovalRequest, outcome: ApprovalChoice): void {
  request.choose(outcome)
  request.submit()
}

export function apply(ctx: Context): void {
  const binnacle = ctx.binnacle
  const requests = ctx.binnacleRequests
  // The mark is the view's own, and a Request on view starts with the first Choice marked.
  const marks = new WeakMap<ApprovalRequest, number>()
  const partOf = (request: ApprovalRequest): Part => {
    const marked = (): number => marks.get(request) ?? 0
    const choicesFrom = 1 + (request.why === undefined ? 0 : 1) + request.arguments.length
    return {
      models: [requests],
      lines: (width) => {
        const lines = [ruleWith(titleOf(request), width)]
        if (request.why !== undefined) lines.push(request.why)
        lines.push(...request.arguments)
        CHOICES.forEach((choice, index) => lines.push(`${index === marked() ? '›' : ' '} ${choice.label}`))
        lines.push(RULE.repeat(Math.max(0, width)))
        return lines
      },
      key: (data) => {
        const actions = binnacle.gestures.actionsOf(data)
        if (actions.includes('tui.select.cancel')) request.dismiss()
        else if (actions.includes('tui.select.confirm')) answer(request, CHOICES[marked()]!.outcome)
        else if (actions.includes('tui.select.up')) marks.set(request, (marked() + CHOICES.length - 1) % CHOICES.length)
        else if (actions.includes('tui.select.down')) marks.set(request, (marked() + 1) % CHOICES.length)
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
  let placed: Handle | undefined
  const detach = drawKind(requests, 'approval', (request) => {
    placed?.dispose()
    placed = request === undefined ? undefined : binnacle.place('composer', partOf(request))
  })
  ctx.effect(() => detach, 'binnacle-approvals: detached from the Requests')
}
