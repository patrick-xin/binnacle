import type { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionOption } from '@deepseek-ai/dsh-user-questions'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import type { Part, Point } from '../../api.ts'
import { toPlainText } from '../../index.ts'
import { Input } from '../../terminal/components/input.ts'
import { CURSOR_MARKER } from '../../terminal/tui.ts'
import { visibleWidth } from '../../terminal/utils.ts'
import { queueOf } from '../requests/index.ts'
import type { Standing } from '../requests/index.ts'

export const name = 'binnacle-questions'

export const inject = ['binnacle'] satisfies (keyof Context)[]

const RULE = '─'
const TYPE = 'Type an answer'
const DONE = 'Done'
// A Part is not told its Place's height, so a page is a fixed count of the Request's lines, not of rows.
const PAGE = 10

interface Choice {
  /** The label as the agent offered it: the identity that answers and selections carry. */
  readonly label: string
  /** The label made plain, as drawn. */
  readonly plain: string
  readonly description: string | undefined
  readonly kind: 'option' | 'type' | 'done'
}

interface Asked extends Standing {
  readonly req: AskUserQuestionRequest
  answers: AskUserQuestionAnswerItem[]
  index: number
  marked: number
  readonly selected: Set<string>
  typing: boolean
  input: Input | undefined
  paged: number | undefined
  /** dsh withdrew the Request, whether it is shown or waits in the queue. */
  withdrawn: () => void
  /** The person dismissed the whole Request, or the plugin unloaded while it stood. */
  dismiss: () => void
  /** The person picked the Choice at the index. */
  pick: (index: number) => void
}

function ruleWith(title: string | undefined, width: number): string {
  if (title === undefined) return RULE.repeat(Math.max(0, width))
  return title + RULE.repeat(Math.max(0, width - visibleWidth(title)))
}

function titleOf(question: AskUserQuestionItem, index: number, of: number): string | undefined {
  const header = question.header === undefined ? undefined : toPlainText(question.header)
  const nth = of === 1 ? undefined : `${index + 1} of ${of}`
  if (header === undefined && nth === undefined) return undefined
  if (header === undefined) return `── ${nth} ──`
  return nth === undefined ? `── ${header} ──` : `── ${header} (${nth}) ──`
}

// A plan review moves the option that approves it to the top, as its intent names it.
function offered(question: AskUserQuestionItem): readonly AskUserQuestionOption[] {
  const options = question.options ?? []
  if (question.intent?.kind !== 'plan-review') return options
  const approve = options.findIndex((option) => option.label === question.intent?.approve)
  if (approve <= 0) return options
  return [options[approve]!, ...options.slice(0, approve), ...options.slice(approve + 1)]
}

function choicesOf(question: AskUserQuestionItem): readonly Choice[] {
  const options = offered(question).map((option): Choice => ({
    label: option.label,
    plain: toPlainText(option.label),
    description: option.description === undefined ? undefined : toPlainText(option.description),
    kind: 'option',
  }))
  if (options.length === 0) return []
  const typed: Choice = { label: TYPE, plain: TYPE, description: undefined, kind: 'type' }
  if (question.multiSelect !== true) return [...options, typed]
  return [...options, typed, { label: DONE, plain: DONE, description: undefined, kind: 'done' }]
}

function detailLines(question: AskUserQuestionItem): readonly string[] {
  return question.detail === undefined ? [] : question.detail.split('\n').map(toPlainText)
}

function choiceLine(choice: Choice, marked: boolean, chosen: boolean, multi: boolean): string {
  const mark = marked ? '›' : ' '
  const box = multi && choice.kind === 'option' ? (chosen ? ' [x] ' : ' [ ] ') : ' '
  const described = choice.description === undefined ? '' : ` — ${choice.description}`
  return `${mark}${box}${choice.plain}${described}`
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
        // Each Request leaves the queue before it is dismissed, so the queue never places one through a plugin that unloads.
        const mine = standing.splice(0)
        queue.settled(...mine)
        for (const request of mine) request.dismiss()
      },
      'binnacle-questions: what still stands, dismissed',
    )
    const partOf = (request: Asked): Part => {
      // dsh refuses a request with no question before the waterfall is asked, so one is always there.
      const question = (): AskUserQuestionItem => request.req.questions[request.index]!
      const choiceFrom = (): number => 2 + detailLines(question()).length
      const total = (): number => choiceFrom() + (request.typing ? 1 : choicesOf(question()).length) + 1
      const drawnInput = (width: number): string => request.input!.render(width)[0]!
      return {
        lines: (width) => {
          const shown = question()
          const lines = [ruleWith(titleOf(shown, request.index, request.req.questions.length), width)]
          lines.push(toPlainText(shown.question))
          lines.push(...detailLines(shown))
          if (request.typing) lines.push(drawnInput(width).replace(CURSOR_MARKER, ''))
          else
            for (const [index, choice] of choicesOf(shown).entries())
              lines.push(choiceLine(choice, index === request.marked, request.selected.has(choice.label), shown.multiSelect === true))
          lines.push(RULE.repeat(Math.max(0, width)))
          return lines
        },
        cursor: (width): Point | undefined => {
          if (request.paged !== undefined) return { line: Math.min(Math.max(0, request.paged), total() - 1), column: 0 }
          if (request.typing) {
            const line = drawnInput(width)
            const at = line.indexOf(CURSOR_MARKER)
            return { line: choiceFrom(), column: at === -1 ? 0 : visibleWidth(line.slice(0, at)) }
          }
          return { line: choiceFrom() + request.marked, column: 0 }
        },
        key: (data) => {
          const actions = binnacle.gestures.actionsOf(data)
          const cursorLine = (): number => request.paged ?? choiceFrom() + (request.typing ? 0 : request.marked)
          if (actions.includes('tui.select.pageUp')) {
            request.paged = Math.max(0, cursorLine() - PAGE)
          } else if (actions.includes('tui.select.pageDown')) {
            request.paged = Math.min(cursorLine() + PAGE, total() - 1)
          } else if (request.typing) {
            request.paged = undefined
            request.input!.handleInput(data)
          } else if (actions.includes('tui.select.cancel')) {
            request.dismiss()
          } else if (actions.includes('tui.select.confirm')) {
            request.paged = undefined
            request.pick(request.marked)
          } else if (actions.includes('tui.select.up')) {
            request.marked = (request.marked + choicesOf(question()).length - 1) % choicesOf(question()).length
            request.paged = undefined
          } else if (actions.includes('tui.select.down')) {
            request.marked = (request.marked + 1) % choicesOf(question()).length
            request.paged = undefined
          } else {
            request.paged = undefined
          }
          // Every other key does nothing while the Request takes the composer's keys.
          return true
        },
        click: (at) => {
          if (request.typing) return false
          const index = at.line - choiceFrom()
          if (index < 0 || index >= choicesOf(question()).length) return false
          request.paged = undefined
          request.pick(index)
          return true
        },
      }
    }
    // The listener is tagged with the Chat's agent, so it answers that agent and each agent under it, and it goes when the plugin unloads.
    const tagged = createScope(scope, chatAgent)
    tagged.ctx.on('user-questions/request', (req: AskUserQuestionRequest) => {
      // dsh's ask refuses a request whose signal aborted before it dispatches the waterfall, and a listener that waited would hang.
      if (req.signal?.aborted) return Promise.reject(aborted())
      return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
        let settled = false
        const request: Asked = {
          req,
          answers: [],
          index: 0,
          marked: 0,
          selected: new Set(),
          typing: false,
          input: undefined,
          paged: undefined,
          part: undefined as unknown as Part,
          place: (part) => binnacle.place('composer', part),
          withdrawn: () => {
            take()
            fail(aborted())
          },
          dismiss: () => {
            take()
            fail(cancelled())
          },
          pick: () => {},
        }
        const take = (): void => {
          const at = standing.indexOf(request)
          if (at === -1) return
          standing.splice(at, 1)
          queue.settled(request)
        }
        const finish = (answer: AskUserQuestionAnswer): void => {
          if (settled) return
          settled = true
          req.signal?.removeEventListener('abort', request.withdrawn)
          resolve(answer)
        }
        const fail = (error: UserQuestionError): void => {
          if (settled) return
          settled = true
          req.signal?.removeEventListener('abort', request.withdrawn)
          reject(error)
        }
        const send = (item: AskUserQuestionAnswerItem): void => {
          request.answers.push(item)
          request.index += 1
          if (request.index >= req.questions.length) {
            take()
            finish({ answers: request.answers })
            return
          }
          showQuestion()
        }
        const showQuestion = (): void => {
          request.marked = 0
          request.selected.clear()
          request.input = undefined
          request.paged = undefined
          request.typing = false
          // A question with no options has nothing to pick: the typed line opens at once.
          if ((req.questions[request.index]!.options ?? []).length === 0) openLine()
        }
        const openLine = (): void => {
          if (request.input === undefined) {
            const input = new Input()
            input.focused = true
            input.onSubmit = (text) => {
              const typed = text.trim()
              if (typed === '') return
              const shown = req.questions[request.index]!
              send({ id: shown.id, selected: shown.multiSelect === true ? [...request.selected] : [], custom: typed })
            }
            input.onEscape = () => {
              // A question with no options has no Choices to go back to: the whole Request is dismissed.
              if ((req.questions[request.index]!.options ?? []).length === 0) request.dismiss()
              else request.typing = false
            }
            request.input = input
          }
          request.typing = true
        }
        request.pick = (index: number) => {
          const shown = req.questions[request.index]!
          const choice = choicesOf(shown)[index]
          if (choice === undefined) return
          request.marked = index
          if (choice.kind === 'type') {
            openLine()
            return
          }
          if (choice.kind === 'done') {
            send({ id: shown.id, selected: shown.multiSelect === true ? [...request.selected] : [] })
            return
          }
          if (shown.multiSelect === true) {
            if (request.selected.has(choice.label)) request.selected.delete(choice.label)
            else request.selected.add(choice.label)
            return
          }
          send({ id: shown.id, selected: [choice.label] })
        }
        request.part = partOf(request)
        showQuestion()
        standing.push(request)
        queue.add(request)
        req.signal?.addEventListener('abort', request.withdrawn, { once: true })
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
