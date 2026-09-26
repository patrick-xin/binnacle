/**
 * The host: the one layer that touches the terminal and the process.
 *
 * It reads the invocation through dsh's command line, and once the launcher
 * commits startup it opens a session on the default model. With `--check`
 * it reports the model and closes it; otherwise it takes the terminal through
 * pi-tui's alternate screen — the transcript in a scroll view that follows
 * its end, the composer below — until the person quits. It provides the
 * `binnacle` service authors register through, and reads the whole log again
 * when a registration comes or goes. A failure it cannot recover from gives
 * back what it took, a terminal half-started included, says what failed, and
 * asks the launcher to exit 1. Every layer below it is a function of facts,
 * UI state and a size; this is where those meet a real process.
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Editor, matchesKey, ProcessTerminal, ScrollView, TuiAltScreen, VStack } from '@earendil-works/pi-tui'
import type { Terminal } from '@earendil-works/pi-tui'
import { adapt } from '../facts/adapt.ts'
import { editorTheme } from '../ui/theme.ts'
import { describe } from '../contract/index.ts'
import { TranscriptPane } from '../panes/transcript.ts'
import { RegistrationService } from './registrations.ts'
import { openSession } from './session.ts'
import type { OpenedSession } from './session.ts'

/** The row's Cordis name, as the bundle patch inserts it. */
export const name = 'binnacle'

/** The services the row needs before it applies: the launcher's command line, dsh's agents, and its default model. Each is a key dsh declares on `Context`. */
export const inject = ['cmdlineArgs', 'agents', 'agentDefaultModel'] satisfies (keyof Context)[]

/** Process-facing seams, replaced by tests. */
export const internals: {
  /** Build the terminal the surface draws on. */
  terminal: () => Terminal
  /** Where `--check` reports. */
  stdout: { write(chunk: string): unknown }
  /** Where a failure is said, once the terminal is given back. */
  stderr: { write(chunk: string): unknown }
  /** Open the session the surface draws. */
  open: (ctx: Context) => Promise<OpenedSession>
} = {
  terminal: () => new ProcessTerminal(),
  stdout: process.stdout,
  stderr: process.stderr,
  open: openSession,
}

/** What this invocation asked for. */
type Mode = 'check' | 'interactive'

/**
 * This surface's command: its flags and help.
 * @param chosen - receives the mode when the invocation parses.
 * @returns a fresh program, so one process can parse more than once.
 */
function surfaceCommand(chosen: (mode: Mode) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('Open a terminal session with an agent.')
    .helpOption('-h, --help', 'show this help')
    .option('--check', 'open a session on the default model, report it, close it, and exit, drawing nothing')
    .action((options: { check?: boolean }) => { chosen(options.check === true ? 'check' : 'interactive') })
}

/**
 * Draw a session on the terminal until the person quits.
 * @param session - the open session.
 * @param registrations - what authors registered: their adapters and views.
 * @param quit - called once, when the person asks to quit.
 * @returns a disposer that gives the terminal back.
 * @throws what starting the terminal threw, having given back what it took.
 */
function takeTerminal(session: OpenedSession, registrations: RegistrationService, quit: () => void): () => void {
  const tui = new TuiAltScreen(internals.terminal())
  const events: SessionEvent[] = []
  const transcript = new TranscriptPane(() => { tui.requestRender() }, () => registrations.views)
  const unregister = registrations.onChange(() => { transcript.reset(events.map(event => adapt(event, registrations.adapters))) })
  const composer = new Editor(tui, editorTheme)
  composer.onSubmit = (text) => {
    if (text.trim() === '') return
    composer.setText('')
    session.send(text)
  }
  tui.addChild(transcript)
  tui.addChild(composer)
  tui.setLayoutRoot(new VStack([
    { component: new ScrollView(transcript, { follow: 'end', primary: true }), basis: 0, grow: 1, shrink: 1, minSize: 1 },
    { component: composer, basis: 'auto', grow: 0, shrink: 1, minSize: 3 },
  ]))
  tui.setFocus(composer)
  tui.addInputListener((data) => {
    if (!matchesKey(data, 'ctrl+c')) return undefined
    quit()
    return { consume: true }
  })
  const unfollow = session.follow((event) => {
    events.push(event)
    transcript.push(adapt(event, registrations.adapters))
  })
  let held = true
  const release = (): void => {
    if (!held) return
    held = false
    unfollow()
    unregister()
    tui.stop()
  }
  try {
    tui.start()
  } catch (error) {
    release()
    throw error
  }
  return release
}

/**
 * Parse the invocation and, once startup commits, open a session and check or draw it.
 * @param ctx - the row's context, carrying the launcher's command line, exit request and readiness, and dsh's agents and default model.
 */
export function apply(ctx: Context): void {
  const registrations = new RegistrationService(ctx)
  let mode: Mode | undefined
  parseCmdline(ctx, surfaceCommand((chosen) => { mode = chosen }))
  if (mode === undefined) return
  const exit = ctx.get('appExit')
  const ready = ctx.get('appReady')
  if (exit === undefined || ready === undefined) {
    throw new Error('binnacle: the launcher must provide ctx.appExit and ctx.appReady before the tree mounts')
  }
  let disposed = false
  let session: OpenedSession | undefined
  let release: (() => void) | undefined
  const close = async (): Promise<void> => {
    release?.()
    release = undefined
    const open = session
    session = undefined
    await open?.close()
  }
  const fail = (what: string) => (error: unknown): void => {
    release?.()
    release = undefined
    internals.stderr.write(`binnacle: ${what}: ${describe(error)}\n`)
    const open = session
    session = undefined
    void open?.close().catch(() => {
      // Closing after a failure is best effort; the failure already said is the one that matters.
    })
    exit(1)
  }
  const quit = (): void => { void close().then(() => { exit(0) }, fail('could not close the session')) }
  const show = (opened: OpenedSession): void => {
    if (disposed) {
      void opened.close().catch(fail('could not close the session'))
      return
    }
    session = opened
    if (mode === 'check') {
      internals.stdout.write(`binnacle: ok (${opened.model})\n`)
      quit()
      return
    }
    release = takeTerminal(opened, registrations, quit)
  }
  const cancel = ready.onReady(() => {
    void internals.open(ctx).then(show, fail('could not open a session on the default model')).catch(fail('could not take the terminal'))
  })
  ctx.effect(() => () => {
    disposed = true
    cancel()
    void close()
  }, 'binnacle: the session and the terminal')
}
