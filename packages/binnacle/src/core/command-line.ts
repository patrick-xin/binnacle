import type { Context } from '@deepseek-ai/cordis'
import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

export interface CommandLine {
  readonly session: string | undefined
}

function program(parsed: (commandLine: CommandLine) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('A terminal app for dsh. Enter sends; esc interrupts; ctrl+c clears the draft, and twice quits; ctrl+z suspends.')
    .helpOption('-h, --help', 'show this help')
    .option('--session <id>', 'a stored session to read; nothing can be sent to it')
    .action((options: { session?: string }) => {
      parsed({ session: options.session })
    })
}

/** The command line, or nothing on --help or a refused command line, where the launcher exits. */
export function readCommandLine(ctx: Context): CommandLine | undefined {
  let commandLine: CommandLine | undefined
  parseCmdline(
    ctx,
    program((parsed) => {
      commandLine = parsed
    }),
  )
  return commandLine
}
