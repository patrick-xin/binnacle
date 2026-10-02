/** A value as an error names it. */
function named(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return 'an array'
  return String(value)
}

/** A file’s block as a record, when it is one; anything else passes to the parser to refuse. */
const block = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/** What one theme file holds as theme changes: pi’s `colors` translated, pi’s other blocks read or ignored. */
export function changes(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`a theme file holds an object, not ${named(data)}`)
  const file = data as Record<string, unknown>
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(file)) {
    if (key === '$schema' || key === 'name' || key === 'export' || key === 'appearance' || key === 'colors') continue
    rest[key] = value
  }
  const colors = block(file.colors)
  if (file.colors !== undefined && colors === undefined) throw new Error(`colors is ${named(file.colors)}, not an object`)
  if (colors === undefined) return rest
  const toned: Record<string, unknown> = {}
  const filled: Record<string, unknown> = {}
  for (const [token, colour] of Object.entries(colors)) {
    if (colour === '') continue
    if (token.endsWith('Bg')) filled[token] = colour
    else toned[token] = { color: colour }
  }
  return {
    ...rest,
    tones: merged(toned, rest.tones),
    backgrounds: merged(filled, rest.backgrounds),
  }
}

/** Colors laid under the file’s own blocks, which win where both name a token; anything else a block is passes to the parser to refuse. */
function merged(from: Record<string, unknown>, own: unknown): unknown {
  const given = block(own)
  if (given !== undefined) return { ...from, ...given }
  return own === undefined ? from : own
}
