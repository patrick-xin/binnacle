import type { Context } from '@deepseek-ai/cordis'
import type { ThemeChanges } from '../../api.ts'
import { changes as fileChanges } from './read.ts'

export const name = 'theme'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** The theme row’s config: which theme file to use, and which on a light and a dark terminal. */
export interface ThemeConfig {
  readonly theme?: string
  readonly light?: string
  readonly dark?: string
}

export function apply(ctx: Context, config: unknown): void {
  const chosen = parsed(config)
  const fields = ['theme', 'light', 'dark'] as const
  if (fields.every((field) => chosen[field] === undefined)) return
  // Each file’s last accepted changes: a hand-over becomes one only once the registration it drove stands.
  const accepted = new Map<(typeof fields)[number], unknown>()
  let last: (() => void) | undefined
  const register = (field: (typeof fields)[number], data: unknown): void => {
    const standing = new Map(accepted)
    standing.set(field, data)
    const combined: Record<string, unknown> = {}
    const base = standing.get('theme')
    if (base !== undefined) Object.assign(combined, fileChanges(base))
    for (const variant of ['light', 'dark'] as const) {
      const handed = standing.get(variant)
      if (chosen[variant] !== undefined && handed !== undefined) combined[variant] = fileChanges(handed)
    }
    // The new registration stands before the last is disposed, so a change the theme refuses leaves the last standing.
    const dispose = ctx.binnacle.theme(combined as ThemeChanges)
    accepted.set(field, data)
    last?.()
    last = dispose
  }
  for (const field of fields) {
    const file = chosen[field]
    if (file === undefined) continue
    ctx.binnacle.themeFile(file, (data) => {
      register(field, data)
    })
  }
}

/** The row’s config, checked where it enters: each field names a theme file, or is left out. */
function parsed(config: unknown): ThemeConfig {
  if (config === undefined || config === null) return {}
  if (typeof config !== 'object' || Array.isArray(config))
    throw new Error(`binnacle-theme: config is ${named(config)}, not { theme, light, dark }`)
  const read: Record<string, string> = {}
  for (const [field, value] of Object.entries(config)) {
    if (field !== 'theme' && field !== 'light' && field !== 'dark')
      throw new Error(`binnacle-theme: config.${field} is no part of the theme row’s config: theme, light, dark`)
    if (typeof value !== 'string')
      throw new Error(`binnacle-theme: config.${field} is ${named(value)}, not the name of a theme file in the profile’s themes directory`)
    read[field] = value
  }
  return read
}

function named(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return 'an array'
  return String(value)
}
