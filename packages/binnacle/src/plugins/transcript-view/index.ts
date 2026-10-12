import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { markdown, toPlainText, truncateToWidth, wrap } from '../../index.ts'
import type { Binnacle, Tone } from '../../index.ts'
import { callOf, failed, isPrompt, noticeOf, producerOf, reasoningOf, textOf } from '../transcript/index.ts'
import type { Call, EventLook, Line, LiveLook, Notice } from '../transcript/index.ts'

export const name = 'binnacle-transcript-view'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** What each piece's Look is given beside its data. */
export interface PieceAt {
  readonly width: number
  /** The event's time, in epoch milliseconds, or `undefined` in the answer that streams, which is no event yet. */
  readonly time: number | undefined
}

/** The Looks `transcript.prompt`, `transcript.answer` and `transcript.reasoning`: a text's lines, given the text as it came, Untrusted Text. */
export type TextLook = (text: string, at: PieceAt) => string[]

/** The Look `transcript.call`: a tool call's lines, given its name and its arguments as the model wrote them, or so far while they stream. */
export type CallLook = (call: Call, at: PieceAt) => string[]

/** A tool's result, as `transcript.result` is given it. */
export interface Result {
  readonly text: string
  readonly failed: boolean
}

/** The Look `transcript.result`: a tool result's lines. */
export type ResultLook = (result: Result, at: PieceAt) => string[]

/** Context the person did not type, as `transcript.context` is given it. */
export interface ContextOf {
  readonly producer: string
}

/** The Look `transcript.context`: the lines of context that dsh added. */
export type ContextLook = (context: ContextOf, at: PieceAt) => string[]

/** The Look `transcript.notice`: the lines of a command, a retry, a compaction or a turn's end. */
export type NoticeLook = (notice: Notice, at: PieceAt) => string[]

// A text's own line breaks are kept, as making it plain takes them out with the other controls.
const plain = (text: string): string =>
  text
    .split(/\r\n|\r|\n/)
    .map(toPlainText)
    .join('\n')

const oneLine = (text: string): string => toPlainText(text.replace(/\s*[\r\n]+\s*/g, ' '))

const firstLineOf = (text: string): string => text.split(/\r\n|\r|\n/).find((line) => line.trim() !== '') ?? ''

const SEVERITY: Readonly<Record<Notice['severity'], { readonly tone: Tone; readonly prefix: string }>> = {
  info: { tone: 'muted', prefix: '· ' },
  warning: { tone: 'warning', prefix: '' },
  error: { tone: 'error', prefix: '✗ ' },
}

function defaults(binnacle: Binnacle) {
  const paint = (tone: Tone, text: string): string => binnacle.paint(tone, text)
  const cut = (text: string, width: number): string => truncateToWidth(text, width, binnacle.tokens.glyphs.more)
  const prompt: TextLook = (text, { width }) =>
    wrap(plain(text), width, { first: `${binnacle.tokens.glyphs.mark} ` }).map((line) => paint('accent', line))
  const answer: TextLook = (text, { width }) => markdown(binnacle, text, width)
  const reasoning: TextLook = (text, { width }) => (plain(text) === '' ? [] : wrap(plain(text), width).map((line) => paint('dim', line)))
  const call: CallLook = ({ name: tool, args }, { width }) => [cut(`⏺ ${oneLine(tool)}(${oneLine(args)})`, width)]
  const result: ResultLook = ({ text, failed: hasFailed }, { width }) => {
    const first = toPlainText(firstLineOf(text))
    if (hasFailed) return [paint('error', cut(`✗ ${first === '' ? 'failed' : first}`, width))]
    return [cut(`⎿ ${first === '' ? '(no text)' : first}`, width)]
  }
  const context: ContextLook = ({ producer }, { width }) => [paint('dim', cut(`· context: ${oneLine(producer)}`, width))]
  const notice: NoticeLook = ({ kind, text, severity }, { width }) => {
    const { tone, prefix } = SEVERITY[severity] ?? SEVERITY.info
    // A command's own name is drawn as the person typed it.
    const first = kind === 'command' && severity === 'info' ? '' : prefix
    return [paint(tone, cut(`${first}${oneLine(text)}`, width))]
  }
  return { prompt, answer, reasoning, call, result, context, notice }
}

export function apply(ctx: Context): void {
  const { binnacle } = ctx
  const fallback = defaults(binnacle)
  const pieces = {
    prompt: () => binnacle.lookOf<TextLook>(['transcript.prompt'], fallback.prompt),
    answer: () => binnacle.lookOf<TextLook>(['transcript.answer'], fallback.answer),
    reasoning: () => binnacle.lookOf<TextLook>(['transcript.reasoning'], fallback.reasoning),
    call: () => binnacle.lookOf<CallLook>(['transcript.call'], fallback.call),
    result: () => binnacle.lookOf<ResultLook>(['transcript.result'], fallback.result),
    context: () => binnacle.lookOf<ContextLook>(['transcript.context'], fallback.context),
    notice: () => binnacle.lookOf<NoticeLook>(['transcript.notice'], fallback.notice),
  }

  // The type's Look folds and spaces the event, so that a piece's Look draws only its piece.
  // An event that does not fold, a prompt, an answer or one of one line, draws its first line as a Line that folds nothing, so a click on it only Marks.
  // An answer is what a person reads, and a fold that nothing on screen shows surprises them: an author who wants it folds it with a Look.
  const typed =
    (linesOf: (event: SessionEvent, at: PieceAt) => string[], blank: boolean, folds = true): EventLook =>
    (event, { folded, width }) => {
      const lines = linesOf(event, { width, time: event.time })
      if (lines.length === 0) return []
      const [first = '', ...rest] = lines
      const shown: Line[] =
        !folds || rest.length === 0
          ? [{ text: first }, ...rest]
          : folded
            ? [first, binnacle.paint('muted', `${binnacle.tokens.glyphs.more} ${rest.length} more lines`)]
            : lines
      return blank ? [...shown, ''] : shown
    }

  const said = (reasoning: string, text: string, at: PieceAt): string[] => [
    ...pieces.reasoning()(reasoning, at),
    ...pieces.answer()(text, at),
  ]
  const noticed = typed((event, at) => {
    const notice = noticeOf(event)
    return notice === undefined ? [] : pieces.notice()(notice, at)
  }, false)

  binnacle.look<EventLook>('transcript.event', () => () => [])
  binnacle.look<EventLook>('transcript.event.user/message', () => (event, at) => {
    if (isPrompt(event)) return typed((each, where) => pieces.prompt()(textOf(each), where), true, false)(event, at)
    const producer = producerOf(event)
    if (producer === undefined) return []
    return typed((_, where) => pieces.context()({ producer }, where), false)(event, at)
  })
  binnacle.look<EventLook>('transcript.event.assistant/message', () =>
    typed((event, at) => said(reasoningOf(event), textOf(event), at), true, false),
  )
  binnacle.look<EventLook>('transcript.event.tool/call', () =>
    typed((event, at) => {
      const call = callOf(event)
      return call === undefined ? [] : pieces.call()(call, at)
    }, false),
  )
  binnacle.look<EventLook>('transcript.event.tool/result', () =>
    typed((event, at) => pieces.result()({ text: textOf(event), failed: failed(event) }, at), true),
  )
  for (const type of ['command/run', 'command/done', 'llm/retry', 'compaction/end', 'turn/end'])
    binnacle.look<EventLook>(`transcript.event.${type}`, () => noticed)

  // The committed answer's order: dsh commits the answer, then its calls' events.
  binnacle.look<LiveLook>('transcript.live', () => (blocks, width) => {
    const joined = (kind: 'text' | 'reasoning'): string =>
      blocks
        .filter((block) => block.kind === kind)
        .map((block) => block.text)
        .join('')
    const at = { width, time: undefined }
    const lines = said(joined('reasoning'), joined('text'), at)
    const calls = blocks
      .filter((block) => block.kind === 'tool-call')
      .flatMap((block) => pieces.call()({ name: block.name ?? '', args: block.text }, at))
    return [...lines, ...(lines.length > 0 ? [''] : []), ...calls]
  })
}
