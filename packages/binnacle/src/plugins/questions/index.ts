/**
 * Questions: what the agent asks a person, answered in the composer's seat,
 * a question at a time. A built-in plugin, holding only what an author
 * holds: the `binnacle` service, to seat its card where an author could
 * seat one; and dsh's `user-questions/request` waterfall, which it answers
 * for the session's agent
 * (`dsh:packages/interaction/user-questions/src/index.ts#UserQuestionService`).
 *
 * While a request stands, the card of its current question is the newest
 * placement in the composer's slot, so it takes the keyboard: its `header`
 * as the title, the question, its `detail` beneath as markdown, each option
 * offered `choose`, and after the options type an answer (`answer`), skip
 * (`choose`) and cancel (`dismiss`). The answer collects every question's
 * answer, in order. A request withdrawn by its signal takes its card back,
 * rejected `ASK_ABORTED`; one standing when the plugin is disposed goes to
 * the next answerer, as dsh asks when nothing answers.
 */

import type { Context, Events } from '@deepseek-ai/cordis'
import type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionItem, AskUserQuestionOption } from '@deepseek-ai/dsh-user-questions'
import type { Node, Placement } from '../../api.ts'

/** What the waterfall hands an answerer, as dsh declares it on its event map; the package does not export it by name. */
type Asked = Parameters<Events['user-questions/request']>[0]

/** The region ids the card offers, minted here and read back by the ask they seat. */
const TYPING = 'type an answer'
const SKIP = 'skip'
const CANCEL = 'cancel'

/**
 * The line an option is offered on: its label, its description beside it in the muted tone, and on a multi-select question the mark of its being marked.
 * @param option - the option.
 * @param multi - whether the question allows more than one option to be marked.
 * @param marked - whether this option is.
 * @returns the line's spans.
 */
function optionLine(option: AskUserQuestionOption, multi: boolean, marked: boolean): Node {
  const spans = [
    ...multi && marked ? [{ mark: 'done' } as const] : multi ? ['  ' as const] : [],
    multi ? ` ${option.label}` : option.label,
    ...option.description === undefined ? [] : [{ text: ` — ${option.description}`, tone: 'muted' } as const],
  ]
  return { kind: 'text', text: spans }
}

/**
 * The card one question is asked with: its `header` as the title, the question, its `detail` beneath as markdown, each option offered `choose`, and after the options type an answer, skip and cancel.
 * @param question - the question.
 * @param marked - the labels marked on its options, in the order they were marked.
 * @returns the card.
 */
function card(question: AskUserQuestionItem, marked: readonly string[]): Node {
  const multi = question.multiSelect === true
  return {
    kind: 'card',
    ...question.header === undefined ? {} : { title: question.header },
    edge: 'accent',
    child: {
      kind: 'stack',
      children: [
        { kind: 'text', text: question.question },
        ...question.detail === undefined ? [] : [{ kind: 'markdown' as const, text: question.detail }],
        ...(question.options ?? []).map((option, index): Node => ({
          kind: 'offer',
          id: `option ${index + 1}`,
          affordances: [{ kind: 'choose', label: option.label }],
          child: optionLine(option, multi, marked.includes(option.label)),
        })),
        { kind: 'offer', id: TYPING, affordances: [{ kind: 'answer', label: 'type an answer' }], child: { kind: 'text', text: 'type an answer' } },
        { kind: 'offer', id: SKIP, affordances: [{ kind: 'choose', label: 'skip' }], child: { kind: 'text', text: 'skip' } },
        { kind: 'offer', id: CANCEL, affordances: [{ kind: 'dismiss', label: 'cancel' }], child: { kind: 'text', text: 'cancel' } },
      ],
    },
  }
}

/** One request standing in the seat: what is answered so far, and the card seated for its current question. */
class Ask {
  private readonly ctx: Context
  private readonly req: Asked
  private readonly settle: (answer: AskUserQuestionAnswer) => void
  private readonly answers: AskUserQuestionAnswerItem[] = []
  private readonly marks: string[] = []
  private readonly acts = new Map<string, () => void>()
  private index = 0
  private unseat: (() => void) | undefined

  /**
   * @param ctx - the plugin's context, to seat the card with.
   * @param req - what the waterfall handed.
   * @param settle - resolves the waterfall's promise, once every question is answered.
   */
  constructor(ctx: Context, req: Asked, settle: (answer: AskUserQuestionAnswer) => void) {
    this.ctx = ctx
    this.req = req
    this.settle = settle
  }

  /** The question the card is seated for. */
  private get question(): AskUserQuestionItem {
    const question = this.req.questions[this.index]
    // dsh refuses a request with no question before the waterfall is asked, so one is there.
    if (question === undefined) throw new Error(`questions: question ${this.index} of a request that has none`)
    return question
  }

  /** Seat the card of the current question, taking the composer's place until it is answered. */
  seat(): void {
    const question = this.question
    this.marks.length = 0
    this.acts.clear()
    ;(question.options ?? []).forEach((option, index) => this.acts.set(`option ${index + 1}`, () => this.choose(index)))
    this.unseat?.()
    const seated: Placement = {
      kind: 'lines',
      draw: () => card(question, this.marks),
      invoke: (region, _affordance) => { this.acts.get(region)?.() },
    }
    this.unseat = this.ctx.binnacle.place('composer', seated)
  }

  /**
   * Choose an option of the current question: it answers the question.
   * @param index - the option's place among those the card offers.
   */
  private choose(index: number): void {
    const option = this.question.options?.[index]
    if (option === undefined) return
    this.answerWith({ id: this.question.id, selected: [option.label] })
  }

  /**
   * Answer the current question and seat the next, or settle the request once its last is answered.
   * @param item - the question's answer.
   */
  private answerWith(item: AskUserQuestionAnswerItem): void {
    this.answers.push(item)
    this.index += 1
    if (this.index >= this.req.questions.length) {
      this.unseat?.()
      this.settle({ answers: this.answers })
      return
    }
    this.seat()
  }
}

/** The Questions plugin, loaded by the host beside the surface it draws on. */
export const questions = {
  name: 'questions',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    ctx.on('user-questions/request', req => new Promise<AskUserQuestionAnswer>((resolve) => {
      const ask = new Ask(ctx, req, resolve)
      ask.seat()
    }))
  },
}
