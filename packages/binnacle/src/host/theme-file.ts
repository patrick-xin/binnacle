import { mkdirSync, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { describe } from '../contract/index.ts'

/** How the file grant schedules by: the host's own clock, faked in a test. */
export interface Clock {
  after(ms: number, then: () => void): () => void
}

/** How long the grant waits out a change, so a file written in pieces is read once. */
const writeWindow = 50

/** How often the grant looks again whether the file changed, for a watch event the platform coalesces away. */
const lookAgain = 1_000

/** Watch one theme file of the profile, handing its parsed JSON over now and as it changes. */
export function watchThemeFile(
  ctx: Context,
  name: string,
  listener: (data: unknown) => void,
  clock: Clock,
  raise: (text: string) => void,
): () => void {
  const profile = ctx.get('profileContext') as ProfileContext | undefined
  if (profile === undefined) {
    raise(`binnacle.themeFile: no profile is loaded to read themes/${name}.json from`)
    return () => {}
  }
  const file = join(profile.dir, 'themes', `${name}.json`)
  let last: string | undefined
  let said: string | undefined
  // A problem that stands is said once, however often the file is looked for; a hand-over clears it, so a problem after one is said again.
  const problem = (text: string): void => {
    if (text === said) return
    said = text
    raise(text)
  }
  const read = (): void => {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      problem(`binnacle.themeFile: ${file} cannot be read: ${describe(error)}`)
      return
    }
    if (text === last) {
      // The file is what it last handed over again: whatever problem stood is over, and a new one is said afresh.
      said = undefined
      return
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (error) {
      problem(`binnacle.themeFile: ${file} is not JSON: ${describe(error)}`)
      return
    }
    last = text
    said = undefined
    try {
      listener(data)
    } catch (error) {
      problem(`binnacle.themeFile: ${file} was handed to a reader that threw: ${describe(error)}`)
    }
  }
  // The directory is made first, so a theme not written yet is still seen when it is.
  const themes = join(profile.dir, 'themes')
  try {
    mkdirSync(themes, { recursive: true })
  } catch (error) {
    raise(`binnacle.themeFile: ${themes} cannot be made: ${describe(error)}`)
    return () => {}
  }
  let cancel: (() => void) | undefined
  const schedule = (): void => {
    cancel?.()
    cancel = clock.after(writeWindow, read)
  }
  // A directory's events are taken as a whole: on macOS a coalesced event names the directory itself, not the file.
  const watcher = watch(themes, { persistent: false }, schedule)
  watcher.on('error', (error) => {
    raise(`binnacle.themeFile: ${themes} can no longer be watched: ${describe(error)}`)
  })
  // The watch alone is not enough: a busy filesystem coalesces a change away, so the file is looked for again now and then.
  let stopLooking: (() => void) | undefined
  const again = (): void => {
    schedule()
    stopLooking = clock.after(lookAgain, again)
  }
  stopLooking = clock.after(lookAgain, again)
  read()
  return () => {
    stopLooking?.()
    cancel?.()
    watcher.close()
  }
}
