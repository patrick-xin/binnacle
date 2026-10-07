import type { Stream } from './capture.ts'
import type { Process } from './host.ts'
import { ProcessTerminal } from '../terminal/process-terminal.ts'
import type { Terminal } from '../terminal/terminal.ts'

/** What the core touches of the process, the terminal and the clock; a test puts its own in their place. */
export const internals: {
  terminal: () => Terminal
  process: Process
  streams: { stdout: Stream; stderr: Stream }
  now: () => number
} = {
  terminal: () => new ProcessTerminal(),
  now: () => Date.now(),
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
