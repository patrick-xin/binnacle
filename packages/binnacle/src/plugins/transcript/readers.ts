import type { SessionEvent } from '@deepseek-ai/dsh-session'

// An event's data is read as unknown: a Look is given every type, and a log written by another harness can hold any shape.
type Fields = Readonly<Record<string, unknown>>

// An object that is not an array is keyed by strings.
const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : undefined

const messageOf = (event: SessionEvent): Fields | undefined => {
  if (event.type === 'user/message') return fields(event.data)
  if (event.type === 'assistant/message' || event.type === 'tool/result') return fields(fields(event.data)?.message)
  return undefined
}

const isReasoning = (block: unknown): boolean => fields(block)?.type === 'reasoning'

const isReasoningRecord = (record: unknown): boolean => {
  const { type, chunk } = fields(record) ?? {}
  if (type === 'reasoning-chunks') return true
  if (type !== 'chunk') return false
  const streamed = fields(chunk)
  return (
    streamed?.type === 'reasoning-delta' ||
    (streamed?.type === 'block-start' && streamed.blockType === 'reasoning') ||
    (streamed?.type === 'block-end' && isReasoning(streamed.block))
  )
}

const blocksOf = (event: SessionEvent, kind: 'text' | 'reasoning'): string => {
  const content = messageOf(event)?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const { type, text } = fields(block) ?? {}
      return type === kind && typeof text === 'string' ? text : ''
    })
    .join('')
}

export function textOf(event: SessionEvent): string {
  return blocksOf(event, 'text')
}

export function reasoningOf(event: SessionEvent): string {
  return event.type === 'assistant/message' ? blocksOf(event, 'reasoning') : ''
}

/** A tool call, as the model wrote it: its arguments are not parsed. */
export interface Call {
  readonly name: string
  readonly args: string
}

export function callOf(event: SessionEvent): Call | undefined {
  if (event.type !== 'tool/call') return undefined
  const { name, arguments: args } = fields(event.data) ?? {}
  if (typeof name !== 'string') return undefined
  return { name, args: typeof args === 'string' ? args : '' }
}

export function producerOf(event: SessionEvent): string | undefined {
  if (event.type !== 'user/message' || isPrompt(event)) return undefined
  const message = messageOf(event)
  if (message === undefined) return undefined
  const kind = fields(message.source)?.kind
  return typeof kind === 'string' ? kind : 'unknown'
}

/** What a command, a retry, a compaction or a turn's end says to a person. */
export interface Notice {
  readonly kind: 'command' | 'retry' | 'compaction' | 'turn'
  readonly text: string
  readonly severity: 'info' | 'warning' | 'error'
}

const messageText = (failure: unknown): string | undefined => {
  const message = fields(failure)?.message
  return typeof message === 'string' ? message : undefined
}

// Only the event that says how a thing ended gives a notice: dsh appends a compaction's summary before the compaction can still fail.
export function noticeOf(event: SessionEvent): Notice | undefined {
  const data = fields(event.data)
  if (data === undefined) return undefined
  switch (event.type as string) {
    case 'command/run': {
      if (typeof data.name !== 'string') return undefined
      // dsh keeps the whitespace between the name and the input in `args`.
      const args = typeof data.args !== 'string' || data.args.trim() === '' ? '' : /^\s/.test(data.args) ? data.args : ` ${data.args}`
      return { kind: 'command', text: `/${data.name}${args}`, severity: 'info' }
    }
    case 'command/done':
      if (typeof data.text !== 'string' || data.text === '') return undefined
      return { kind: 'command', text: data.text, severity: data.kind === 'error' ? 'error' : 'info' }
    case 'llm/retry': {
      if (typeof data.retry !== 'number') return undefined
      const of = typeof data.maxRetries === 'number' ? `${data.retry}/${data.maxRetries}` : `${data.retry}`
      const why = messageText(data.failure)
      return { kind: 'retry', text: why === undefined ? `retrying (${of})` : `retrying (${of}): ${why}`, severity: 'warning' }
    }
    case 'compaction/end':
      return typeof data.error === 'string'
        ? { kind: 'compaction', text: `compaction failed: ${data.error}`, severity: 'error' }
        : { kind: 'compaction', text: 'context compacted', severity: 'info' }
    case 'turn/end': {
      const reason = fields(data.reason)
      if (reason?.kind === 'error') return { kind: 'turn', text: messageText(reason.error) ?? 'the turn failed', severity: 'error' }
      if (reason?.kind === 'aborted') return { kind: 'turn', text: 'interrupted', severity: 'info' }
      if (reason?.kind === 'max-tokens') return { kind: 'turn', text: 'stopped at the output limit', severity: 'warning' }
      return undefined
    }
    default:
      return undefined
  }
}

export function isPrompt(event: SessionEvent): boolean {
  return event.type === 'user/message' && fields(messageOf(event)?.source)?.kind === 'user'
}

export function failed(event: SessionEvent): boolean {
  return event.type === 'tool/result' && (messageOf(event)?.isError === true || fields(event.data)?.error !== undefined)
}

export function withoutReasoning<Event extends SessionEvent>(event: Event): Event {
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return event
  const data = fields(event.data)
  const message = fields(data?.message)
  const content = message?.content
  const stream = data?.stream
  const inContent = Array.isArray(content) && content.some(isReasoning)
  const inStream = Array.isArray(stream) && stream.some(isReasoningRecord)
  if (!inContent && !inStream) return event
  return {
    ...event,
    data: {
      ...data,
      ...(inContent && { message: { ...message, content: content.filter((block) => !isReasoning(block)) } }),
      ...(inStream && { stream: stream.filter((record) => !isReasoningRecord(record)) }),
    },
  }
}
