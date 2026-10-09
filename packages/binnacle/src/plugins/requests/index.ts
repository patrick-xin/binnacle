import type { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome, ApprovalRequest as DshApproval } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionOption,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import type { ApprovalChoice, ApprovalRequest, Choice, Question, QuestionRequest, Request, Requests } from '../../api.ts'
import { createModel } from '../../core/model.ts'
import { toPlainText } from '../../core/view.ts'
import { changedAtOnce, failsClosed, standingOf } from './old-rows.ts'

export const name = 'binnacle-requests'

export const inject = [] satisfies (keyof Context)[]

// The arguments are capped before they wrap, so a Request's lines are the same at every width.
const MOST_LINES = 12

// A plan review moves the option that approves it to the top, as its intent names it.
function offered(question: AskUserQuestionItem): readonly AskUserQuestionOption[] {
  const options = question.options ?? []
  if (question.intent?.kind !== 'plan-review') return options
  const approve = options.findIndex((option) => option.label === question.intent?.approve)
  if (approve <= 0) return options
  return [options[approve]!, ...options.slice(0, approve), ...options.slice(approve + 1)]
}

function questionOf(item: AskUserQuestionItem): Question {
  const options = offered(item).map((option): Choice => ({
    kind: 'option',
    label: option.label,
    text: toPlainText(option.label),
    description: option.description === undefined ? undefined : toPlainText(option.description),
  }))
  const multiSelect = item.multiSelect === true
  const more: Choice[] = multiSelect ? [{ kind: 'other' }, { kind: 'done' }] : [{ kind: 'other' }]
  return {
    id: item.id,
    header: item.header === undefined ? undefined : toPlainText(item.header),
    question: toPlainText(item.question),
    detail: item.detail === undefined ? [] : item.detail.split('\n').map(toPlainText),
    multiSelect,
    planReview: item.intent?.kind === 'plan-review',
    choices: options.length === 0 ? [] : [...options, ...more],
  }
}

function argumentLinesOf(callId: string | undefined, events: readonly SessionEvent[]): string[] {
  if (callId === undefined) return []
  const call = events.find((event): event is SessionEvent<'tool/call'> => event.type === 'tool/call' && event.data.callId === callId)
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

interface Draft {
  selected: string[]
  custom: string | undefined
}

export function apply(ctx: Context): void {
  const standing: Request[] = []
  const views = new Set<object>()
  const told = createModel({})
  const changed = (): void => {
    told.set(() => {})
    changedAtOnce(requests)
  }
  let quiet = false
  // Every Request settles before a view is told, so a view that throws as it unloads cannot leave one pending.
  const failAll = (): void => {
    quiet = true
    try {
      for (const request of standing.slice()) failsClosed.get(request)!()
    } finally {
      quiet = false
    }
    changed()
  }
  const requests: Requests = {
    get shown() {
      return standing[0]
    },
    get standing() {
      return standing.length
    },
    watch: told.watch,
    attach: () => {
      const view = {}
      views.add(view)
      return () => {
        if (!views.delete(view)) return
        if (views.size === 0) failAll()
      }
    },
  }
  ctx.provide('binnacleRequests', requests)
  standingOf.set(requests, () => standing.slice())
  ctx.effect(() => failAll, 'binnacle-requests: what still stands, failed closed')

  const stand = (request: Request, failClosed: () => void): void => {
    standing.push(request)
    failsClosed.set(request, failClosed)
    changed()
  }
  const stands = (request: Request): boolean => standing.includes(request)
  // Each Request is settled once, and with dsh before a view is told that it went.
  const take = (request: Request, settle: () => void): void => {
    const at = standing.indexOf(request)
    if (at === -1) return
    standing.splice(at, 1)
    settle()
    if (!quiet) changed()
  }

  // The session opens after dsh's plugins settle; a plugin that waited for it at load would be reported as never active.
  ctx.inject(['binnacleSession'], (scope) => {
    const chat = scope.binnacleSession
    // A stored session has no agent to answer for, and dsh fails closed as before.
    if (chat.agent === undefined) return
    const chatAgent = chat.agent
    const agentOf = (agent: { id: string } | undefined): string | undefined =>
      agent === undefined || agent === chatAgent ? undefined : toPlainText(agent.id)
    // Each listener is tagged with the Chat's agent, so it answers that agent and each agent under it, and it goes when the plugin unloads.
    const tagged = createScope(scope, chatAgent)

    tagged.ctx.on('approval/request', (req: DshApproval, next: () => Promise<ApprovalOutcome>) => {
      // With no view, no person sees the Request: dsh's own fallback fails it closed.
      if (views.size === 0) return next()
      // The signal can abort before the waterfall dispatches, as dsh's ApprovalService defers the dispatch: the Request is withdrawn already.
      if (req.signal?.aborted) return Promise.resolve('cancelled')
      return new Promise<ApprovalOutcome>((resolve) => {
        const settle = (outcome: ApprovalOutcome): void =>
          take(request, () => {
            req.signal?.removeEventListener('abort', withdrawn)
            resolve(outcome)
          })
        const withdrawn = (): void => settle('cancelled')
        const why = req.displayReason?.en ?? req.reason
        let chosen: ApprovalChoice | undefined
        const request: ApprovalRequest = {
          kind: 'approval',
          tool: toPlainText(req.toolName),
          agent: agentOf(req.agent),
          why: why === undefined ? undefined : toPlainText(why),
          arguments: argumentLinesOf(req.callId, chat.events),
          choices: ['allowed-once', 'rejected'],
          get chosen() {
            return chosen
          },
          choose: (outcome) => {
            if (!stands(request)) return
            chosen = outcome
            changed()
          },
          submit: () => {
            if (chosen !== undefined) settle(chosen)
          },
          dismiss: () => settle('rejected'),
        }
        stand(request, () => settle('unavailable'))
        req.signal?.addEventListener('abort', withdrawn, { once: true })
      })
    })

    tagged.ctx.on('user-questions/request', (req: AskUserQuestionRequest, next: () => Promise<AskUserQuestionAnswer>) => {
      if (views.size === 0) return next()
      // dsh's ask refuses a request whose signal aborted before it dispatches the waterfall, and a listener that waited would hang.
      if (req.signal?.aborted) return Promise.reject(aborted())
      return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
        const end = (settle: () => void): void =>
          take(request, () => {
            req.signal?.removeEventListener('abort', withdrawn)
            settle()
          })
        const fail = (error: UserQuestionError): void => end(() => reject(error))
        const withdrawn = (): void => fail(aborted())
        const questions = req.questions.map(questionOf)
        const drafts: Draft[] = questions.map(() => ({ selected: [], custom: undefined }))
        let index = 0
        // A question with no options has nothing to pick: the person types at once. dsh refuses a request with no question before it asks.
        let typing = questions[0]!.choices.length === 0
        const change = (making: (draft: Draft, question: Question) => void): void => {
          if (!stands(request)) return
          making(drafts[index]!, questions[index]!)
          changed()
        }
        const request: QuestionRequest = {
          kind: 'question',
          agent: agentOf(req.agent),
          questions,
          get index() {
            return index
          },
          go: (to) => {
            if (to < 0 || to >= questions.length || to === index) return
            change(() => {
              index = to
              typing = questions[to]!.choices.length === 0
            })
          },
          get typing() {
            return typing
          },
          type: (on) =>
            change(() => {
              typing = on
            }),
          drafts,
          toggle: (label) =>
            change((draft, question) => {
              if (question.multiSelect) {
                const at = draft.selected.indexOf(label)
                if (at === -1) draft.selected.push(label)
                else draft.selected.splice(at, 1)
              } else {
                draft.selected = draft.selected[0] === label ? [] : [label]
                draft.custom = undefined
              }
            }),
          write: (text) =>
            change((draft, question) => {
              const typed = text?.trim()
              draft.custom = typed === '' ? undefined : typed
              // In a question that allows one answer, a typed answer is that one.
              if (draft.custom !== undefined && !question.multiSelect) draft.selected = []
            }),
          submit: () => {
            const answers = questions.map((question, at): AskUserQuestionAnswerItem => ({
              id: question.id,
              selected: [...drafts[at]!.selected],
              ...(drafts[at]!.custom === undefined ? {} : { custom: drafts[at]!.custom }),
            }))
            end(() => resolve({ answers }))
          },
          dismiss: () => fail(cancelled()),
        }
        stand(request, () => fail(cancelled()))
        req.signal?.addEventListener('abort', withdrawn, { once: true })
      })
    })
  })
}

function aborted(): UserQuestionError {
  return new UserQuestionError('ask_user_question was aborted before the user answered', 'ASK_ABORTED')
}

function cancelled(): UserQuestionError {
  return new UserQuestionError('the user dismissed ask_user_question', 'ASK_CANCELLED')
}
