import type { Context, Events } from '@deepseek-ai/cordis'
import type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionItem, AskUserQuestionOption } from '@deepseek-ai/dsh-user-questions'
import type { Node, Placement } from '../../api.ts'

type Asked = Parameters<Events['user-questions/request']>[0]

type AnswerNext = Parameters<Events['user-questions/request']>[1]

const TYPING = 'type an answer'
const SKIP = 'skip'
const CANCEL = 'cancel'
const DONE = 'done'

function refused(code: 'ASK_ABORTED' | 'ASK_CANCELLED', message: string): Error {
  const error = new Error(message) as Error & { code: string }
  error.name = 'UserQuestionError'
  error.code = code
  return error
}

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

function offered(question: AskUserQuestionItem): readonly AskUserQuestionOption[] {
  const options = question.options ?? []
  const approve = question.intent?.kind === 'plan-review' ? options.findIndex(option => option.label === question.intent?.approve) : -1
  return approve > 0 ? [...options.slice(approve), ...options.slice(0, approve)] : options
}

function asked(question: AskUserQuestionItem): readonly Node[] {
  return [
    { kind: 'text', text: question.question },
    ...question.detail === undefined ? [] : [{ kind: 'markdown' as const, text: question.detail }],
  ]
}

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

  constructor(ctx: Context, req: Asked, next: AnswerNext, settle: (answer: AskUserQuestionAnswer) => void, refuse: (reason: unknown) => void, leave: () => boolean) {
    this.ctx = ctx
    this.req = req
    this.next = next
    this.settle = settle
    this.refuse = refuse
    this.leave = leave
    req.signal?.addEventListener('abort', this.withdrawn, { once: true })
  }

  private readonly withdrawn = (): void => {
    this.finish(() => { this.refuse(refused('ASK_ABORTED', 'ask_user_question was aborted before the user answered')) })
  }

  handOver(): void {
    this.finish(() => { this.next().then(this.settle, this.refuse) })
  }

  private get question(): AskUserQuestionItem {
    const question = this.req.questions[this.index]
    // dsh refuses a request with no question before the waterfall is asked, so one is there.
    if (question === undefined) throw new Error(`questions: question ${this.index} of a request that has none`)
    return question
  }

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


  private redraw(): void {
    const seated = this.seated
    if (seated === undefined) return
    const unseat = this.ctx.binnacle.place('composer', seated)
    this.unseat?.()
    this.unseat = unseat
  }


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

  private answerWith(item: AskUserQuestionAnswerItem): void {
    this.answers.push(item)
    this.index += 1
    if (this.index >= this.req.questions.length) {
      this.finish(() => { this.settle({ answers: this.answers }) })
      return
    }
    this.seat()
  }

  // Once-guard via leave().
  private finish(settled: () => void): void {
    if (!this.leave()) return
    this.close()
    settled()
  }

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

export const questions = {
  name: 'questions',
  inject: ['binnacle'] satisfies (keyof Context)[],
  apply(ctx: Context): void {
    const standing = new Set<Ask>()
    ctx.effect(() => () => {
      // Set iteration proceeds past deletions.
      for (const ask of standing) ask.handOver()
    }, 'questions: what still stands, handed to the next answerer')
    ctx.on('user-questions/request', (req, next) => new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      const ask = new Ask(ctx, req, next, resolve, reject, () => standing.delete(ask))
      standing.add(ask)
      ask.seat()
    }))
  },
}
