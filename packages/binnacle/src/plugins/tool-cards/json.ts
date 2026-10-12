// dsh's data, as a person reads it.

type Fields = Readonly<Record<string, unknown>>

// An object that is not an array is keyed by strings.
export const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : undefined

const scalar = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' || value === null ? String(value) : undefined

// A value on one line: text as it is, a list of such values joined, and anything deeper as compact JSON.
const inline = (value: unknown): string => {
  const one = scalar(value)
  if (one !== undefined) return one
  if (Array.isArray(value) && value.every((item) => scalar(item) !== undefined)) return value.map(scalar).join(', ')
  return JSON.stringify(value) ?? ''
}

// dsh's data as its web app draws it: an object as a line for each key, a list as a line for each item.
export const readable = (value: unknown): string[] => {
  const object = fields(value)
  if (object !== undefined) return Object.entries(object).map(([key, field]) => `${key}: ${inline(field)}`)
  return Array.isArray(value) ? value.map(inline) : [inline(value)]
}

// A JSON text to draw: each number kept as it was written, as parsing it can change its digits.
export const asWritten = (text: string): { readonly value: unknown; readonly parsed: boolean } => {
  try {
    const value: unknown = JSON.parse(text, (_, each: unknown, context?: { readonly source?: string }) =>
      typeof each === 'number' && context?.source !== undefined ? context.source : each,
    )
    return { value, parsed: true }
  } catch {
    return { value: text, parsed: false }
  }
}
