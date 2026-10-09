import type { Stream } from './capture.ts'
import type { Process } from './host.ts'
import type { TerminalColorMode } from '../terminal/colors.ts'
import { ProcessTerminal } from '../terminal/process-terminal.ts'
import type { Terminal } from '../terminal/terminal.ts'

/** What the core touches of the process, the terminal and the clock; a test puts its own in their place. */
export const internals: {
  terminal: () => Terminal
  process: Process
  streams: { stdout: Stream; stderr: Stream }
  now: () => number
  colorMode: () => TerminalColorMode
} = {
  terminal: () => new ProcessTerminal(),
  now: () => Date.now(),
  // A terminal that does not say in COLORTERM that it has truecolor gets the nearest of 256 for an exact colour.
  colorMode: () => (['truecolor', '24bit'].includes(process.env.COLORTERM?.toLowerCase() ?? '') ? 'truecolor' : '256color'),
  process: {
    on: (event, listener) => {
      process.on(event, listener)
    },
    off: (event, listener) => {
      process.off(event, listener)
    },
    stop: () => {
      process.kill(process.pid, 'SIGSTOP')
    },
  },
  streams: { stdout: process.stdout, stderr: process.stderr },
}
