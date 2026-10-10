import type { Context } from '@deepseek-ai/cordis'
import type { Binnacle, Layout, QuestionRequest, Request } from '../../api.ts'
import { line, list, title } from '../../kit/index.ts'
import type { ListItem } from '../../kit/index.ts'

export const name = 'binnacle-requests-view'

export const inject = ['binnacle', 'binnacleRequests'] satisfies (keyof Context)[]

const deepFrozen = <T extends object>(value: T): T => {
  for (const inner of Object.values(value)) if (typeof inner === 'object' && inner !== null) deepFrozen(inner)
  return Object.freeze(value)
}

/**
 * The Layout `request`: the Title, the question or the arguments, the Choices, and the Line, over a rule.
 * Frozen, as an author builds on it. The body and the Choices fill, so that a tall one scrolls and both stay in view.
 */
export const REQUEST_LAYOUT: Layout & { readonly column: readonly Layout[] } = deepFrozen({
  column: [
    { place: 'request.title', size: 'content' },
    { place: 'request.body', size: 'fill' },
    { place: 'request.choices', size: 'fill' },
    { place: 'request.line', size: 'content' },
  ],
  border: ['bottom'],
})

/** The Title of the Request: an approval's tool, and the agent that asks when it is not the Chat's; a question's header, and `1 of 3` among several. */
export function titleOf(request: Request): string {
  if (request.kind === 'approval')
    return request.agent === undefined ? `${request.tool} needs approval` : `${request.tool} needs approval (${request.agent})`
  const question = request.questions[request.index]!
  const nth = request.questions.length === 1 ? undefined : `${request.index + 1} of ${request.questions.length}`
  if (question.header === undefined) return nth ?? ''
  return nth === undefined ? question.header : `${question.header} (${nth})`
}

/** The Choices of the Request as List items: none while the person types. */
export function itemsOf(request: Request | undefined): readonly ListItem[] {
  if (request === undefined) return []
  if (request.kind === 'approval')
    return request.choices.map((outcome) => ({ label: outcome === 'allowed-once' ? 'Allow once' : 'Reject' }))
  if (request.typing) return []
  const question = request.questions[request.index]!
  const { selected } = request.drafts[request.index]!
  return question.choices.map((choice): ListItem => {
    if (choice.kind === 'other') return { label: 'Type an answer' }
    if (choice.kind === 'done') return { label: 'Done' }
    return {
      label: choice.text,
      ...(choice.description === undefined ? {} : { description: choice.description }),
      ...(question.multiSelect ? { checked: selected.includes(choice.label) } : {}),
    }
  })
}

/** After a question is answered: the next question, or, after the last, the action `requests.send`. */
export function advance(binnacle: Binnacle, request: QuestionRequest): void {
  if (request.index + 1 < request.questions.length) request.go(request.index + 1)
  else binnacle.run('requests.send')
}

/** The person picked the Choice at that index: an approval's outcome is sent; a question's option is chosen, or toggled where more than one can be. */
export function pick(binnacle: Binnacle, request: Request, index: number): void {
  if (request.kind === 'approval') {
    const outcome = request.choices[index]
    if (outcome === undefined) return
    request.choose(outcome)
    binnacle.run('requests.send')
    return
  }
  const question = request.questions[request.index]!
  const choice = question.choices[index]
  if (choice === undefined) return
  if (choice.kind === 'other') return request.type(true)
  if (choice.kind === 'done') return advance(binnacle, request)
  if (question.multiSelect) return request.toggle(choice.label)
  // A toggle of the option selected already would unselect it.
  if (!request.drafts[request.index]!.selected.includes(choice.label)) request.toggle(choice.label)
  advance(binnacle, request)
}

const ids = new WeakMap<Request, number>()
let made = 0

/** One key for each Request and each of its questions, so that the List's mark and the Line's text are its own. */
export function keyOf(request: Request | undefined): string {
  if (request === undefined) return ''
  if (!ids.has(request)) ids.set(request, made++)
  return `${ids.get(request)}:${request.kind === 'question' ? request.index : 0}`
}

/** The core's own, which an author's `Binnacle` need not have. */
interface Focused {
  focusedPlace?(): string | undefined
}

export function apply(ctx: Context): void {
  const binnacle = ctx.binnacle
  const requests = ctx.binnacleRequests
  const models = [requests]
  const shown = (): Request | undefined => requests.shown
  const ownsFocus = (): boolean => {
    const place = (binnacle as Binnacle & Focused).focusedPlace?.()
    return place === undefined || place === 'request.choices' || place === 'request.line'
  }
  const typing = (): QuestionRequest | undefined => {
    const request = shown()
    return request?.kind === 'question' && request.typing ? request : undefined
  }

  binnacle.layout('request', REQUEST_LAYOUT)
  title(binnacle, { name: 'request.title', models, text: () => (shown() === undefined ? undefined : titleOf(shown()!)) })
  binnacle.place('request.body', {
    models,
    lines: () => {
      const request = shown()
      if (request === undefined) return []
      if (request.kind === 'approval') return [...(request.why === undefined ? [] : [request.why]), ...request.arguments]
      const question = request.questions[request.index]!
      return [question.question, ...question.detail]
    },
  })
  const choices = list(binnacle, {
    name: 'request.choices',
    models,
    key: () => keyOf(shown()),
    items: () => itemsOf(shown()),
    pick: (index) => {
      const request = shown()
      if (request !== undefined) pick(binnacle, request, index)
    },
    toggle: (index) => {
      const request = shown()
      if (request?.kind !== 'question') return
      const choice = request.questions[request.index]!.choices[index]
      if (choice?.kind === 'option') request.toggle(choice.label)
    },
  })
  const typed = line(binnacle, {
    name: 'request.line',
    models,
    key: () => keyOf(shown()),
    shown: () => typing() !== undefined,
    submit: (text) => {
      const request = typing()
      if (request === undefined || text.trim() === '') return
      request.write(text)
      advance(binnacle, request)
    },
    escape: () => {
      const request = typing()
      if (request === undefined) return
      const back = request.questions[request.index]!.choices.findIndex((choice) => choice.kind === 'other')
      // A question with no options has no Choices to go back to.
      if (back === -1) return request.dismiss()
      request.type(false)
      // The List lost its mark while it had no items, and the person comes back to the Choice that opened the Line.
      choices.model.set((state) => (state.mark = back))
    },
  })

  binnacle.action('requests.send', {
    keys: [],
    description: 'Send the answer of the Request on view',
    run: () => shown()?.submit(),
  })
  binnacle.action('requests.dismiss', {
    keys: ['escape'],
    place: 'request.choices',
    description: 'Reject an approval, or dismiss a question',
    run: () => shown()?.dismiss(),
  })
  // A Request takes the keys that the core would act on, as a Request that stands keeps them from the Chat; the Line takes every key itself.
  binnacle.action('requests.keep', {
    keys: ['ctrl+c', 'ctrl+z', 'shift+tab'],
    place: 'request.choices',
    description: 'Do nothing while a Request stands: no clear, quit, suspend or Focus moved',
    run: () => {},
  })
  // The body scrolls from each Place of the Request that takes keys, the Line included, so the List's own page keys give way.
  const keysIn = ['request.choices', 'request.line']
  binnacle.bind('request.choices.pageUp', [])
  binnacle.bind('request.choices.pageDown', [])
  binnacle.action('requests.pageUp', {
    keys: ['pageUp'],
    place: keysIn,
    first: true,
    description: 'Scroll the Request up a page',
    run: () => binnacle.scroll('request.body', -1),
  })
  binnacle.action('requests.pageDown', {
    keys: ['pageDown'],
    place: keysIn,
    first: true,
    description: 'Scroll the Request down a page',
    run: () => binnacle.scroll('request.body', 1),
  })

  // A Request that comes takes the Focus: the Line while the person types, else the Choices.
  // When the Line only opens or closes, a Place that a plugin focused keeps the Focus.
  let followed: { key: string; typing: boolean } | undefined
  const follow = (): void => {
    const request = shown()
    const now = request === undefined ? undefined : { key: keyOf(request), typing: typing() !== undefined }
    const moves = now !== undefined && (now.key !== followed?.key || (now.typing !== followed.typing && ownsFocus()))
    if (moves) (now.typing ? typed : choices).handle.focus()
    followed = now
  }
  ctx.effect(() => requests.watch(follow), 'binnacle-requests-view: the Focus follows the Request')
  ctx.effect(() => requests.attach(), 'binnacle-requests-view: attached to the Requests')
  follow()
}
