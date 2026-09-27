/**
 * The host: the one layer that touches the terminal and the process.
 *
 * It reads the invocation through dsh's command line, and once the launcher
 * commits startup it opens a session on the default model. With `--check`
 * it reports the model and closes it; otherwise it takes the terminal until
 * the person quits, on the screen they asked for and switch to: the alternate
 * screen, the transcript in a scroll view that follows its end, or the main
 * screen, the transcript printed into the scrollback; the composer below
 * either ([ADR 12](../../../../docs/adr/0012-binnacle-draws-on-either-screen-and-a-person-switches-between-them.md)).
 * It provides the `binnacle` service authors register through, and reads the
 * whole log again when an adapter comes or goes. A failure it cannot recover from gives
 * back what it took, a terminal half-started included, says what failed, and
 * asks the launcher to exit 1. Every layer below it is a function of facts,
 * UI state and a size; this is where those meet a real process.
 */

import { Command, Option } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Editor, matchesKey, ProcessTerminal, ScrollView, TuiAltScreen, TuiMainScreen, VStack } from '@earendil-works/pi-tui'
import type { Terminal, TUI, TuiInputListenerResult, TuiMainScreenRenderState, TuiMode } from '@earendil-works/pi-tui'
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

/** What this invocation asked for: a check, or the terminal on a screen, in pi's words for them. */
type Mode = 'check' | TuiMode

/**
 * This surface's command: its flags and help.
 * @param chosen - receives the mode when the invocation parses.
 * @returns a fresh program, so one process can parse more than once.
 */
function surfaceCommand(chosen: (mode: Mode) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('Open a terminal session with an agent. Ctrl+T switches screens; Ctrl+C quits.')
    .helpOption('-h, --help', 'show this help')
    .option('--check', 'open a session on the default model, report it, close it, and exit, drawing nothing')
    .addOption(new Option('--tui-mode <mode>', 'the screen to start on: fullscreen, the alternate screen, or regular, the main screen and its scrollback').choices(['regular', 'fullscreen']).default('fullscreen'))
    .action((options: { check?: boolean, tuiMode: TuiMode }) => { chosen(options.check === true ? 'check' : options.tuiMode) })
}

/**
 * A pi-tui object that reaches whichever is live, for a component built with
 * one, as pi's are (`pi:packages/coding-agent/src/modes/interactive/tui-renderer.ts#createInteractiveTuiReference`).
 * @param live - the one live now.
 * @returns the reference.
 */
function reaching(live: () => TUI): TUI {
  return new Proxy({} as TUI, {
    get: (_target, property) => {
      const tui = live()
      const value: unknown = Reflect.get(tui, property, tui)
      return typeof value === 'function' ? value.bind(tui) : value
    },
  })
}

/**
 * Draw a session on the terminal until the person quits, on either screen.
 *
 * A switch stops the live pi-tui object and builds the other over the same
 * terminal, as pi does (`pi:packages/coding-agent/src/modes/interactive/interactive-mode.ts`).
 * What the old one held is carried to the new: the pane and the composer,
 * focus, and the keys the host answers. Where the main screen left off is
 * kept for its next turn, as the terminal keeps what it printed.
 * @param session - the open session.
 * @param registrations - what authors registered: their adapters and views.
 * @param quit - called once, when the person asks to quit.
 * @param first - the screen to start on.
 * @returns a disposer that gives the terminal back, the session left printed on the main screen.
 * @throws what starting the terminal threw, having given back what it took.
 */
function takeTerminal(session: OpenedSession, registrations: RegistrationService, quit: () => void, first: TuiMode): () => void {
  const terminal = internals.terminal()
  const events: SessionEvent[] = []
  let tui: TuiMainScreen | TuiAltScreen
  let left: TuiMainScreenRenderState | undefined
  const transcript = new TranscriptPane(() => { tui.requestRender() }, () => registrations.views)
  // A change of adapters changes the facts, so the log is read again; a change of views only needs a frame, which draws again what they drew.
  const unregister = registrations.onChange((changed) => {
    if (changed === 'facts') transcript.reset(events.map(event => adapt(event, registrations.adapters)))
    else tui.requestRender()
  })
  const composer = new Editor(reaching(() => tui), editorTheme)
  composer.onSubmit = (text) => {
    if (text.trim() === '') return
    composer.setText('')
    session.send(text)
  }
  const keys = (data: string): TuiInputListenerResult => {
    if (matchesKey(data, 'ctrl+c')) quit()
    else if (matchesKey(data, 'ctrl+t')) show(tui.mode === 'fullscreen' ? 'regular' : 'fullscreen')
    else return undefined
    return { consume: true }
  }
  const build = (mode: TuiMode): TuiMainScreen | TuiAltScreen => {
    transcript.drawOn(mode)
    const next = mode === 'regular' ? new TuiMainScreen(terminal) : new TuiAltScreen(terminal)
    if (next instanceof TuiMainScreen && left !== undefined) next.restoreRenderState(left)
    next.addChild(transcript)
    next.addChild(composer)
    if (next instanceof TuiAltScreen) {
      next.setLayoutRoot(new VStack([
        { component: new ScrollView(transcript, { follow: 'end', primary: true }), basis: 0, grow: 1, shrink: 1, minSize: 1 },
        { component: composer, basis: 'auto', grow: 0, shrink: 1, minSize: 3 },
      ]))
    }
    next.setFocus(composer)
    next.addInputListener(keys)
    return next
  }
  const leave = (): void => {
    if (tui instanceof TuiMainScreen) left = tui.captureRenderState()
    tui.stop({ preserveScreen: true })
    tui.setFocus(null)
    tui.clear()
    if (tui instanceof TuiAltScreen) tui.setLayoutRoot(undefined)
  }
  function show(mode: TuiMode): void {
    leave()
    tui = build(mode)
    tui.start()
  }
  tui = build(first)
  const unfollow = session.follow((event) => {
    events.push(event)
    transcript.push(adapt(event, registrations.adapters))
  })
  let held = true
  let started = false
  const release = (): void => {
    if (!held) return
    held = false
    unfollow()
    unregister()
    // Quitting from the alternate screen goes by the main screen, as pi's does, so the session is left printed there once, after what it printed before.
    if (started && tui.mode === 'fullscreen') {
      leave()
      tui = build('regular')
      tui.renderNow()
    }
    tui.stop()
  }
  try {
    tui.start()
    started = true
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
  let parsed: Mode | undefined
  parseCmdline(ctx, surfaceCommand((chosen) => { parsed = chosen }))
  if (parsed === undefined) return
  const mode: Mode = parsed
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
    release = takeTerminal(opened, registrations, quit, mode)
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
