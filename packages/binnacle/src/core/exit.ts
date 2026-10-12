import type { AppExit } from '@deepseek-ai/dsh-cmdline'
import type { Process } from './host.ts'

// As long as dsh gives its own disposal before it forces an exit, so binnacle never cuts that short.
const END_WITHIN_MS = 5_000

/** dsh's exit, which then ends the process though a socket is left open, such as a proxy's. */
export const endingExit =
  (appExit: AppExit, process: Process) =>
  (code: number): void => {
    process.endWithin(END_WITHIN_MS)
    appExit(code)
  }
