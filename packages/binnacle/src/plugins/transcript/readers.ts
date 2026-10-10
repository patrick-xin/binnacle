import type { SessionEvent } from '@deepseek-ai/dsh-session'

// An event's data is read as unknown: a Look is given every type, and a log written by another harness can hold any shape.
type Fields = Readonly<Record<string, unknown>>

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

export function textOf(event: SessionEvent): string {
  if (event.type !== 'user/message' && event.type !== 'assistant/message') return ''
  const content = messageOf(event)?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      const { type, text } = fields(block) ?? {}
      return type === 'text' && typeof text === 'string' ? text : ''
    })
    .join('')
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
