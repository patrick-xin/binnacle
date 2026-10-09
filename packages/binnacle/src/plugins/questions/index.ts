import type { Context } from '@deepseek-ai/cordis'
import type { Choice, Handle, Part, Point, Question, QuestionRequest } from '../../api.ts'
import { Input } from '../../terminal/components/input.ts'
import { CURSOR_MARKER } from '../../terminal/tui.ts'
import { visibleWidth } from '../../terminal/utils.ts'
import { drawKind } from '../requests/old-rows.ts'

export const name = 'binnacle-questions'

export const inject = ['binnacle', 'binnacleRequests'] satisfies (keyof Context)[]

const RULE = '─'
const TYPE = 'Type an answer'
const DONE = 'Done'
// A Part is not told its Place's height, so a page is a fixed count of the Request's lines, not of rows.
const PAGE = 10

/** What the view keeps of the question on view, apart from the model: it starts again at each question. */
interface Seen {
  readonly index: number
  marked: number
  input: Input | undefined
  paged: number | undefined
}

function ruleWith(title: string | undefined, width: number): string {
  if (title === undefined) return RULE.repeat(Math.max(0, width))
  return title + RULE.repeat(Math.max(0, width - visibleWidth(title)))
}

function titleOf(question: Question, index: number, of: number): string | undefined {
  const nth = of === 1 ? undefined : `${index + 1} of ${of}`
  if (question.header === undefined && nth === undefined) return undefined
  if (question.header === undefined) return `── ${nth} ──`
  return nth === undefined ? `── ${question.header} ──` : `── ${question.header} (${nth}) ──`
}

function choiceLine(choice: Choice, marked: boolean, chosen: boolean, multi: boolean): string {
  const mark = marked ? '›' : ' '
  if (choice.kind === 'other') return `${mark} ${TYPE}`
  if (choice.kind === 'done') return `${mark} ${DONE}`
  const box = multi ? (chosen ? ' [x] ' : ' [ ] ') : ' '
  const described = choice.description === undefined ? '' : ` — ${choice.description}`
  return `${mark}${box}${choice.text}${described}`
}

// The answers go back together, after the last question.
function advance(request: QuestionRequest): void {
  if (request.index + 1 < request.questions.length) request.go(request.index + 1)
  else request.submit()
}

export function apply(ctx: Context): void {
  const binnacle = ctx.binnacle
  const requests = ctx.binnacleRequests
  const seen = new WeakMap<QuestionRequest, Seen>()
  const seenOf = (request: QuestionRequest): Seen => {
    const kept = seen.get(request)
    if (kept !== undefined && kept.index === request.index) return kept
    const fresh: Seen = { index: request.index, marked: 0, input: undefined, paged: undefined }
    seen.set(request, fresh)
    return fresh
  }
  const inputOf = (request: QuestionRequest): Input => {
    const view = seenOf(request)
    if (view.input !== undefined) return view.input
    const input = new Input()
    input.focused = true
    input.onSubmit = (text) => {
      if (text.trim() === '') return
      request.write(text)
      advance(request)
    }
    input.onEscape = () => {
      // A question with no options has no Choices to go back to: the whole Request is dismissed.
      if (request.questions[request.index]!.choices.length === 0) request.dismiss()
      else request.type(false)
    }
    view.input = input
    return input
  }
  const pick = (request: QuestionRequest, index: number): void => {
    const question = request.questions[request.index]!
    const choice = question.choices[index]
    if (choice === undefined) return
    seenOf(request).marked = index
    if (choice.kind === 'other') request.type(true)
    else if (choice.kind === 'done') advance(request)
    else {
      request.toggle(choice.label)
      if (!question.multiSelect) advance(request)
    }
  }
  const partOf = (request: QuestionRequest): Part => {
    const question = (): Question => request.questions[request.index]!
    const choiceFrom = (): number => 2 + question().detail.length
    const total = (): number => choiceFrom() + (request.typing ? 1 : question().choices.length) + 1
    const drawnInput = (width: number): string => inputOf(request).render(width)[0]!
    return {
      models: [requests],
      lines: (width) => {
        const shown = question()
        const view = seenOf(request)
        const selected = request.drafts[request.index]!.selected
        const lines = [ruleWith(titleOf(shown, request.index, request.questions.length), width)]
        lines.push(shown.question)
        lines.push(...shown.detail)
        if (request.typing) lines.push(drawnInput(width).replace(CURSOR_MARKER, ''))
        else
          for (const [index, choice] of shown.choices.entries())
            lines.push(
              choiceLine(choice, index === view.marked, choice.kind === 'option' && selected.includes(choice.label), shown.multiSelect),
            )
        lines.push(RULE.repeat(Math.max(0, width)))
        return lines
      },
      cursor: (width): Point | undefined => {
        const view = seenOf(request)
        if (view.paged !== undefined) return { line: Math.min(Math.max(0, view.paged), total() - 1), column: 0 }
        if (request.typing) {
          const line = drawnInput(width)
          const at = line.indexOf(CURSOR_MARKER)
          return { line: choiceFrom(), column: at === -1 ? 0 : visibleWidth(line.slice(0, at)) }
        }
        return { line: choiceFrom() + view.marked, column: 0 }
      },
      key: (data) => {
        const view = seenOf(request)
        const actions = binnacle.gestures.actionsOf(data)
        const count = question().choices.length
        const cursorLine = (): number => view.paged ?? choiceFrom() + (request.typing ? 0 : view.marked)
        if (actions.includes('tui.select.pageUp')) {
          view.paged = Math.max(0, cursorLine() - PAGE)
        } else if (actions.includes('tui.select.pageDown')) {
          view.paged = Math.min(cursorLine() + PAGE, total() - 1)
        } else if (request.typing) {
          view.paged = undefined
          inputOf(request).handleInput(data)
        } else if (actions.includes('tui.select.cancel')) {
          request.dismiss()
        } else if (actions.includes('tui.select.confirm')) {
          view.paged = undefined
          pick(request, view.marked)
        } else if (actions.includes('tui.select.up')) {
          view.marked = (view.marked + count - 1) % count
          view.paged = undefined
        } else if (actions.includes('tui.select.down')) {
          view.marked = (view.marked + 1) % count
          view.paged = undefined
        } else {
          view.paged = undefined
        }
        // Every other key does nothing while the Request takes the composer's keys.
        return true
      },
      click: (at) => {
        if (request.typing) return false
        const index = at.line - choiceFrom()
        if (index < 0 || index >= question().choices.length) return false
        seenOf(request).paged = undefined
        pick(request, index)
        return true
      },
    }
  }
  let placed: Handle | undefined
  const detach = drawKind(requests, 'question', (request) => {
    placed?.dispose()
    placed = request === undefined ? undefined : binnacle.place('composer', partOf(request))
  })
  ctx.effect(() => detach, 'binnacle-questions: detached from the Requests')
}
