/**
 * Text that other code writes to the process's streams while binnacle draws.
 * @module binnacle/core/capture
 */

/** A stream other code writes text to: the process's stdout or stderr. */
export interface Stream {
  write(chunk: string): unknown
}

/**
 * Hold back what is written to each stream until the capture ends.
 * @param streams - the streams to capture.
 * @returns a function that ends the capture, and writes what was held back to each stream it was meant for, in order.
 */
export function capture(streams: readonly Stream[]): () => void {
  const held: { stream: Stream; text: string }[] = []
  const writes = streams.map((stream) => {
    const write = stream.write
    stream.write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
      held.push({ stream, text: typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8') })
      // A caller that passed a callback is told the write is done.
      const done = rest.find((value) => typeof value === 'function') as (() => void) | undefined
      done?.()
      return true
    }
    return { stream, write }
  })
  return () => {
    for (const { stream, write } of writes) stream.write = write
    for (const { stream, text } of held) stream.write(text)
  }
}
