import type { Context, Events } from '@deepseek-ai/cordis'
import type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionItem, AskUserQuestionOption } from '@deepseek-ai/dsh-user-questions'
import type { Node, Placement } from '../../api.ts'

/** What the waterfall hands an answerer, as dsh declares it on its event map; the package does not export it by name. */
type Asked = Parameters<Events['user-questions/request']>[0]

/** The rest of the waterfall's chain, handed to an answerer to delegate to. */
type AnswerNext = Parameters<Events['user-questions/request']>[1]

/** The region ids the card offers, minted here and read back by the ask that seats it. */
const TYPING = 'type an answer'
const SKIP = 'skip'
const CANCEL = 'cancel'
const DONE = 'done'

/**
 * A rejection dsh's user-questions service reads back as its own: the shape its web client sends — an error named `UserQuestionError`, carrying dsh's code — for the class itself does not cross the wire (`dsh:packages/client/ui-user-questions/src/client/contract/slots.ts`, whose `questionError` is private).
 * @param code - dsh's code for the refusal, as the client sends it.
 * @param message - what it says, in dsh's words.
 * @returns the error to reject the waterfall with.
 */
function refused(code: 'ASK_ABORTED' | 'ASK_CANCELLED', message: string): Error {
  const error = new Error(message) as Error & { code: string }
  error.name = 'UserQuestionError'
  error.code = code
  return error
}

/**
 * The line an option is offered on: its label, its description beside it in the muted tone, and on a multi-select question the mark of its being marked.
 * @param option - the option.
 * @param multi - whether the question allows more than one option to be marked.
 * @param marked - whether this option is.
 * @returns the line as a text node.
 */
function optionLine(option: AskUserQuestionOption, multi: boolean, marked: boolean): Node {
  return {
    kind: 'text',
    text: [
      ...multi && marked ? [{ mark: 'done' } as const] : multi ? [' ' as const] : [],
      multi ? ` ${option.label}` : option.label,
      ...option.description === undefined ? [] : [{ text: ` — ${option.description}`, tone: 'muted' } as const],
    ],
  }
}

/**
 * The options of a question as the card offers them: as the asker gave them, except that a plan-review question offers its approve option first, so it is the card's primary — what Enter does (`dsh:packages/interaction/user-questions/src/types.ts#AskUserQuestionIntent`).
 * @param question - the question.
 * @returns its options.
 */
function offered(question: AskUserQuestionItem): readonly AskUserQuestionOption[] {
  const options = question.options ?? []
  const approve = question.intent?.kind === 'plan-review' ? options.findIndex(option => option.label === question.intent?.approve) : -1
  return approve > 0 ? [...options.slice(approve), ...options.slice(0, approve)] : options
}

/**
 * The question's own lines: the question, and its `detail` beneath as markdown.
 * @param question - the question.
 * @returns what it draws of itself.
 */
function asked(question: AskUserQuestionItem): readonly Node[] {
  return [
    { kind: 'text', text: question.question },
    ...question.detail === undefined ? [] : [{ kind: 'markdown' as const, text: question.detail }],
  ]
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
    kind: 'ask',
    ...question.header === undefined ? {} : { title: question.header },
    edge: 'accent',
    child: {
      kind: 'stack',
      children: [
        ...asked(question),
        ...offered(question).map((option, index): Node => ({
          kind: 'offer',
          id: `option ${index + 1}`,
          affordances: [{ kind: 'choose', label: option.label }],
          child: optionLine(option, multi, marked.includes(option.label)),
        })),
        ...multi ? [{ kind: 'offer' as const, id: DONE, affordances: [{ kind: 'choose' as const, label: 'done' }], child: { kind: 'text' as const, text: 'done' } }] : [],
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
  private readonly next: AnswerNext
  private readonly settle: (answer: AskUserQuestionAnswer) => void
  private readonly refuse: (reason: unknown) => void
  private readonly leave: () => boolean
  private readonly answers: AskUserQuestionAnswerItem[] = []
  private readonly marks: string[] = []
  private readonly acts = new Map<string, () => void>()
  private index = 0
  private unseat: (() => void) | undefined
  private seated: Placement | undefined
  private unsit: (() => void) | undefined
  private unshow: (() => void) | undefined

  /**
   * @param ctx - the plugin's context, to seat the card with.
   * @param req - what the waterfall handed.
   * @param next - the rest of the waterfall's chain, to hand the request to when the plugin is disposed with it standing.
   * @param settle - resolves the waterfall's promise, once every question is answered.
   * @param refuse - rejects the waterfall's promise, when the person cancels the ask or its signal withdraws it.
   * @param leave - takes the ask out of what the plugin holds standing, reporting whether it stood; finishing is once, and this is what makes it so.
   */
  constructor(ctx: Context, req: Asked, next: AnswerNext, settle: (answer: AskUserQuestionAnswer) => void, refuse: (reason: unknown) => void, leave: () => boolean) {
    this.ctx = ctx
    this.req = req
    this.next = next
    this.settle = settle
    this.refuse = refuse
    this.leave = leave
    req.signal?.addEventListener('abort', this.withdrawn, { once: true })
  }

  /** The request was withdrawn by its signal: take the card back and reject, as dsh's web client does when the host aborts under it. */
  private readonly withdrawn = (): void => {
    this.finish(() => { this.refuse(refused('ASK_ABORTED', 'ask_user_question was aborted before the user answered')) })
  }

  /** Hand the request to the next answerer, its card taken back: what the plugin leaves standing when it is disposed, as dsh asks when nothing answers. */
  handOver(): void {
    this.finish(() => { this.next().then(this.settle, this.refuse) })
  }

  /** The question the card is seated for. */
  private get question(): AskUserQuestionItem {
    const question = this.req.questions[this.index]
    // dsh refuses a request with no question before the waterfall is asked, so one is there.
    if (question === undefined) throw new Error(`questions: question ${this.index} of a request that has none`)
    return question
  }

  /** Seat the card of the current question, taking the composer's place until it is answered: the newest placement in the composer's slot, so it takes the keyboard. */
  seat(): void {
    // A signal already aborted never fires the listener, so it is answered here, as dsh's own client answers it at construction.
    if (this.req.signal?.aborted === true) {
      this.withdrawn()
      return
    }
    const question = this.question
    this.marks.length = 0
    this.acts.clear()
    ;offered(question).forEach((option, index) => this.acts.set(`option ${index + 1}`, () => this.choose(index)))
    if (question.multiSelect === true) this.acts.set(DONE, () => this.answerWith({ id: question.id, selected: [...this.marks] }))
    this.acts.set(TYPING, () => this.typeAnswer())
    this.acts.set(SKIP, () => this.answerWith({ id: question.id, selected: [] }))
    this.acts.set(CANCEL, () => {
      this.finish(() => { this.refuse(refused('ASK_CANCELLED', 'the user cancelled ask_user_question')) })
    })
    this.unseat?.()
    const seated: Placement = {
      kind: 'lines',
      draw: () => card(question, this.marks),
      invoke: (region, _affordance) => { this.acts.get(region)?.() },
    }
    this.seated = seated
    this.unseat = this.ctx.binnacle.place('composer', seated)
  }

  /**
   * Draw the seated card again, for what answering on it changed: the marks on its options. It is placed again as it stands — the same placement, placed while the copy before it still holds the seat — and the older copy is then taken back, so the pane that draws the card, and the focus on it, are kept.
   */
  private redraw(): void {
    const seated = this.seated
    if (seated === undefined) return
    const unseat = this.ctx.binnacle.place('composer', seated)
    this.unseat?.()
    this.unseat = unseat
  }

  /**
   * Place a composer in the seat over the card — the newest placement in the composer's slot, so the person types where they were typing — and the question above it, its header, question and detail without its offers, so they are not typing blind. A line they submit is the question's custom answer, on a multi-select question beside every option marked; a blank line takes the composer and the question above back, and gives the card the seat again.
   */
  private typeAnswer(): void {
    this.unsit?.()
    this.unsit = this.ctx.binnacle.place('composer', {
      kind: 'composer',
      submit: (text) => {
        this.unsit?.()
        this.unsit = undefined
        this.unshow?.()
        this.unshow = undefined
        if (text === '') return
        const question = this.question
        this.answerWith({
          id: question.id,
          selected: question.multiSelect === true ? [...this.marks] : [],
          custom: text,
        })
      },
    })
    const question = this.question
    this.unshow?.()
    this.unshow = this.ctx.binnacle.place('above-composer', {
      kind: 'lines',
      draw: () => ({
        kind: 'ask',
        ...question.header === undefined ? {} : { title: question.header },
        edge: 'accent',
        child: { kind: 'stack', children: asked(question) },
      }),
    })
  }

  /**
   * Choose an option of the current question: on a single-select question it answers, and on a multi-select one it toggles the option's mark, leaving the question open.
   * @param index - the option's place among those the card offers.
   */
  private choose(index: number): void {
    const option = offered(this.question)[index]
    if (option === undefined) return
    if (this.question.multiSelect !== true) {
      this.answerWith({ id: this.question.id, selected: [option.label] })
      return
    }
    if (this.marks.includes(option.label)) this.marks.splice(this.marks.indexOf(option.label), 1)
    else this.marks.push(option.label)
    this.redraw()
  }

  /**
   * Answer the current question and seat the next, or settle the request once its last is answered.
   * @param item - the question's answer.
   */
  private answerWith(item: AskUserQuestionAnswerItem): void {
    this.answers.push(item)
    this.index += 1
    if (this.index >= this.req.questions.length) {
      this.finish(() => { this.settle({ answers: this.answers }) })
      return
    }
    this.seat()
  }

  /**
   * Take back everything the ask seated and finish it, once: settle it, refuse it, or hand it on. Leaving what stands is what makes it once — the first finish takes the ask out, and the rest find it gone — as Approvals' settle does.
   * @param settled - how it finishes.
   */
  private finish(settled: () => void): void {
    if (!this.leave()) return
    this.close()
    settled()
  }

  /** Take back everything the ask seated, leaving the composer to the person. */
  private close(): void {
    this.req.signal?.removeEventListener('abort', this.withdrawn)
    this.unshow?.()
    this.unshow = undefined
    this.unsit?.()
    this.unsit = undefined
    this.unseat?.()
    this.unseat = undefined
    this.seated = undefined
  }
}

/**
 * The Questions plugin, loaded by the host beside the surface it draws on.
 * It answers dsh's `user-questions/request` waterfall for the session's agent
 * (`dsh:packages/interaction/user-questions/src/index.ts#UserQuestionService`).
 */
export const questions = {
  name: 'questions',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    const standing = new Set<Ask>()
    ctx.effect(() => () => {
      // Each finishes once and ignores what follows; a Set's iteration goes on past what it deletes.
      for (const ask of standing) ask.handOver()
    }, 'questions: what still stands, handed to the next answerer')
    ctx.on('user-questions/request', (req, next) => new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      // Leaving what stands is the ask's own once-guard, read back through `leave` below.
      const ask = new Ask(ctx, req, next, resolve, reject, () => standing.delete(ask))
      standing.add(ask)
      ask.seat()
    }))
  },
}
