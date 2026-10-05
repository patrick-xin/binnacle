export interface Stream {
  write(chunk: string): unknown
}

/** Holds back what other code writes to the streams. The returned function restores them and writes what was held, in order. */
export function capture(streams: readonly Stream[]): () => void {
  const held: { stream: Stream; text: string }[] = []
  const originals = streams.map((stream) => {
    const write = stream.write
    stream.write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
      held.push({ stream, text: typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8') })
      // A caller that waits on the write's callback would otherwise wait forever.
      const done = rest.find((value) => typeof value === 'function') as (() => void) | undefined
      done?.()
      return true
    }
    return { stream, write }
  })
  return () => {
    for (const { stream, write } of originals) stream.write = write
    for (const { stream, text } of held) stream.write(text)
  }
}
