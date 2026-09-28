/**
 * The host: the one layer that touches the terminal and the process.
 *
 * It reads the invocation through dsh's command line, and once the launcher
 * commits startup it opens a session on the default model. With `--check`
 * it reports the model and closes it; otherwise it takes the terminal until
 * the person quits, on the screen they asked for and switch to: the alternate
 * screen, the transcript in a scroll view that follows its end, or the main
 * screen, the transcript printed into the scrollback; the composer below
 * either; and, on the key a plugin offered, a screen it placed in the
 * transcript's place there, to which the person is switched while it is
 * open.
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
import { Editor, ProcessTerminal, ScrollView, setKeybindings, TuiAltScreen, TuiMainScreen, VStack } from '@earendil-works/pi-tui'
import type { Component, Keybinding, Terminal, TUI, TuiInputListenerResult, TuiMainScreenRenderState, TuiMode, StackChild } from '@earendil-works/pi-tui'
import { adapt } from '../facts/adapt.ts'
import type { Fact } from '../facts/adapt.ts'
import { editorTheme } from '../ui/theme.ts'
import { AFFORDANCE_BINDINGS, BINNACLE_BINDINGS, keyTable } from '../ui/keys.ts'
import { affordances, describe } from '../contract/index.ts'
import { TranscriptPane } from '../panes/transcript.ts'
import { ScreenPane } from '../panes/screen.ts'
import type { Placement, Slot, Surface } from '../api.ts'
import { approvals } from '../plugins/approvals/index.ts'
import { composer as composerFeature } from '../plugins/composer/index.ts'
import { statusLine } from '../plugins/status-line/index.ts'
import { transcript as transcriptFeature } from '../plugins/transcript/index.ts'
import { toolCards } from '../plugins/tool-cards/index.ts'
import { trajectory } from '../plugins/trajectory/index.ts'
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
  /** The time, the one place binnacle reads it: now, in milliseconds, and a call back after some. */
  clock: { now(): number, after(ms: number, then: () => void): () => void }
} = {
  terminal: () => new ProcessTerminal(),
  stdout: process.stdout,
  stderr: process.stderr,
  open: openSession,
  clock: {
    now: () => Date.now(),
    after: (ms, then) => {
      const timer = setTimeout(then, ms)
      return () => { clearTimeout(timer) }
    },
  },
}

/** The page as placed, read from the placements as they stand. */
interface Page {
  /** Whether binnacle's transcript is in the transcript's place. */
  readonly transcript: boolean
  /** The lines placed above the composer, oldest first. */
  readonly above: readonly Component[]
  /** What is in the composer's place: binnacle's composer, lines, or nothing. */
  readonly composer: Component | undefined
  /** The lines placed below the composer, oldest first. */
  readonly below: readonly Component[]
}

/** How long a first Ctrl+C waits for a second to quit, in milliseconds. */
const quitWindow = 3_000

/** How long a notice saying what went wrong stands, in milliseconds. */
const problemWindow = 5_000

/** What the alternate screen's reading place holds when neither the transcript nor a screen is placed there: nothing, growing. */
const nothing: Component = { render: () => [], invalidate: () => {} }

/** What this invocation asked for: a check, or the terminal on a screen, in pi's words for them. */
type Mode = 'check' | TuiMode

/**
 * The keys as `--help` names them: each of binnacle's bindings and each affordance's, with its keys and what it does,
 * read from the one table, never restated. dsh parses the command line as the row applies
 * (`dsh:packages/boot/cmdline/src/index.ts#parseCmdline`), before any plugin has registered, so what plugins offer or
 * rebind is not here.
 * @returns the help text under its heading.
 */
function keysHelp(): string {
  const { manager } = keyTable()
  const named = [...Object.keys(BINNACLE_BINDINGS), ...Object.keys(AFFORDANCE_BINDINGS)].map((id) => {
    const keys = manager.getKeys(id as Keybinding).join(', ')
    return `  ${keys === '' ? '(unbound)' : keys}  ${manager.getDefinition(id as Keybinding)?.description ?? ''}`
  })
  return `Keys:\n${named.join('\n')}`
}

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
    .addHelpText('after', `\n${keysHelp()}`)
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
 * focus, the one key table's listener, and the transcript's scroll view with
 * its scroll. A placed screen does not carry: it lives in the alternate
 * screen's scroll view, and leaving that screen closes it. Where the main
 * screen left off is kept for its next turn, as the terminal keeps what it
 * printed.
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
  const facts: Fact[] = []
  let tui: TuiMainScreen | TuiAltScreen
  let left: TuiMainScreenRenderState | undefined
  let scroll: ScrollView | undefined
  // A focus the pane brings on screen is brought into view by the scroll view that windows it, on the alternate screen.
  const intoView = (top: number, height: number): void => {
    const view = scroll
    if (view === undefined) return
    tui.renderNow()
    if (top < view.scrollTop) view.scrollTo(top)
    else if (top + height > view.scrollTop + view.viewportHeight) view.scrollTo(top + height - view.viewportHeight)
  }
  const transcript = new TranscriptPane(() => { tui.requestRender() }, () => registrations.views, {
    inView: intoView,
    fullscreen: () => { show('fullscreen') },
  }, () => registrations.currentTheme)
  // The screens plugins placed, each in a pane of its own with a scroll view of its own, so what a person did to
  // one — where they scrolled it — is kept while its registration stands. One is open at a time: it takes the
  // transcript's place in the alternate screen's scroll view, so pi-tui's scrolling, search and selection read it
  // as they read the transcript; the composer below is untouched, and stays live.
  const screenPanes = new Map<string, ScreenPane>()
  const screenViews = new Map<string, ScrollView>()
  let followed: ScrollView | undefined
  let open: { readonly name: string, readonly pane: ScreenPane, readonly on: TuiMode } | undefined
  /** The transcript's scroll view, kept for as long as the terminal is taken, so its scroll survives a placed screen and a switch. */
  function transcriptView(): ScrollView {
    if (followed === undefined) {
      followed = new ScrollView(transcript, { follow: 'end', primary: true })
      scroll = followed
    }
    return followed
  }
  /**
   * The alternate screen's layout: what the person is reading in the primary scroll view, growing to fill what the
   * rest leave, then what is placed above the composer, the composer, and what is placed below it, each at its height.
   */
  const readBelowComposer = (reading: ScrollView | undefined): VStack => new VStack([
    { component: reading ?? nothing, basis: 0, grow: 1, shrink: 1, minSize: reading === undefined ? 0 : 1 },
    ...around().map((component): StackChild => ({ component, basis: 'auto', grow: 0, shrink: 1, minSize: component === composer ? 3 : 0 })),
  ])
  /** Lay out the alternate screen: a placed screen that is open in the transcript's place, or the transcript if it is placed. */
  function readOn(alternate: TuiAltScreen): void {
    const reading = open === undefined
      ? (page.transcript ? transcriptView() : undefined)
      : screenViews.get(open.name) ?? new ScrollView(open.pane, { primary: true })
    if (open !== undefined && reading !== undefined) screenViews.set(open.name, reading)
    // What is being read is what focus is brought into view on: the transcript, or the placed screen that is open.
    scroll = reading
    alternate.setLayoutRoot(readBelowComposer(reading))
  }
  // The page as placed: whether binnacle's transcript is in its place, and what sits around the composer and in its
  // place — binnacle's composer, lines, or nothing. Each lines placement in a slot is drawn by a pane of its own, kept
  // while it stands there, so one placement in two slots is named by each slot when it goes wrong.
  const linesPanes = new Map<Slot, Map<Placement, ScreenPane>>()
  /**
   * The pane that draws a lines placement in its slot, kept for as long as the placement stands there.
   * @param slot - where it is placed, to name it by.
   * @param placement - the lines.
   */
  const linesPane = (slot: Slot, placement: Extract<Placement, { readonly kind: 'lines' }>): ScreenPane => {
    const inSlot = linesPanes.get(slot) ?? new Map<Placement, ScreenPane>()
    linesPanes.set(slot, inSlot)
    const kept = inSlot.get(placement)
    if (kept !== undefined) return kept
    // Lines are drawn as a placed screen is, UI state and all, so what they offer answers a person through the one
    // gesture table; an offer UI state does not answer reaches the placement's invoke.
    const pane = new ScreenPane(() => facts, {
      changed: () => { tui.requestRender() },
      invoked: (region, affordance) => { placement.invoke?.(region, affordance) },
    }, () => registrations.currentTheme)
    pane.place(slot, { draw: drawn => placement.draw(drawn, surface()) }, `binnacle.place(${slot})`)
    inSlot.set(placement, pane)
    return pane
  }
  /** Read the page from the placements as they stand, forgetting the panes of lines no longer placed. */
  function arrange(): Page {
    const lines = (slot: Slot): readonly ScreenPane[] => registrations.placed(slot).flatMap(placement => placement.kind === 'lines' ? [linesPane(slot, placement)] : [])
    const inComposer = registrations.placed('composer').at(-1)
    const arranged: Page = {
      transcript: registrations.placed('transcript').at(-1)?.kind === 'transcript',
      above: lines('above-composer'),
      composer: inComposer === undefined ? undefined : inComposer.kind === 'lines' ? linesPane('composer', inComposer) : composer,
      below: lines('below-composer'),
    }
    const standing = new Set<Component | undefined>([...arranged.above, arranged.composer, ...arranged.below])
    for (const [slot, panes] of linesPanes) {
      for (const [placement, pane] of panes) if (!standing.has(pane)) panes.delete(placement)
      if (panes.size === 0) linesPanes.delete(slot)
    }
    return arranged
  }
  /** What sits under the transcript's place, top to bottom: the lines above the composer, the composer's place, the lines below it. */
  const around = (): readonly Component[] => [...page.above, ...(page.composer === undefined ? [] : [page.composer]), ...page.below]
  /**
   * Stack the page on a screen: on the main screen, the order it is printed in; on the alternate one, what its layout reads.
   * @param on - the screen.
   */
  function stack(on: TuiMainScreen | TuiAltScreen): void {
    on.clear()
    if (page.transcript) on.addChild(transcript)
    for (const component of around()) on.addChild(component)
    if (on instanceof TuiAltScreen) readOn(on)
    // Typing reaches binnacle's composer where it is placed, and nothing where it is not.
    on.setFocus(page.composer === composer ? composer : null)
  }
  /** Close the placed screen that is open: the transcript returns to its place, and one opened from the main screen returns there. */
  function closeScreen(): void {
    if (open === undefined) return
    const back = open.on
    open = undefined
    if (tui.mode !== 'fullscreen') return
    if (back === 'regular') show('regular')
    else if (tui instanceof TuiAltScreen) readOn(tui)
  }
  /** Open a placed screen: on the alternate screen it takes the transcript's place; from the main screen the person is switched to it, as codex enters the alternate screen for its transcript (`codex:codex-rs/tui/src/app_backtrack.rs`). */
  function openScreen(id: string): void {
    const placed = registrations.screens.get(id)
    if (placed === undefined) return
    // Another screen takes the place of one that is open, relaid out below or by the switch.
    open = undefined
    let pane = screenPanes.get(id)
    if (pane === undefined) {
      pane = new ScreenPane(() => facts, { changed: () => { tui.requestRender() }, inView: intoView }, () => registrations.currentTheme)
      screenPanes.set(id, pane)
    }
    pane.place(id, placed)
    open = { name: id, pane, on: tui.mode }
    if (tui instanceof TuiAltScreen) readOn(tui)
    else show('fullscreen')
  }
  // A change of adapters changes the facts, so the log is read again; a change of views or of the theme only needs a
  // frame, which draws again what they drew; a change of placements lays the page out again. Placed lines are drawn
  // again at any change.
  const unregister = registrations.onChange((changed) => {
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
    if (changed === 'facts') {
      // The whole log is read again, into the same array the placed screens are handed, so they see it as it now stands.
      facts.length = 0
      for (const event of events) facts.push(adapt(event, registrations.adapters))
      transcript.reset(facts)
      for (const pane of screenPanes.values()) pane.factsChanged()
    } else if (changed === 'screens') offerScreens()
    else if (changed === 'keys') {
      table.bind(registrations.bindings)
      setKeybindings(table.manager)
    } else if (changed === 'placements') {
      page = arrange()
      stack(tui)
      tui.requestRender()
    } else tui.requestRender()
  })
  // Where the session stands, as the session reads it live, with the notice the host raises laid over it: what lines
  // are handed, and drawn again as it changes.
  let notice: string | undefined
  const surface = (): Surface => ({ ...session.standing(), ...notice === undefined ? {} : { notice } })
  const restand = (): void => {
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
    tui.requestRender()
  }
  const unstand = session.onStanding(restand)
  // A notice stands for its time, and goes; a newer one takes its place.
  let unraise: (() => void) | undefined
  let arming: (() => void) | undefined
  const raise = (text: string, ms: number): void => {
    unraise?.()
    notice = text
    unraise = internals.clock.after(ms, () => {
      notice = undefined
      unraise = undefined
      restand()
    })
    restand()
  }
  const composer = new Editor(reaching(() => tui), editorTheme)
  let page = arrange()
  // A submitted line is the composer placement's to act on: the built-in Composer plugin sends it, through the grant
  // opened below; binnacle's composer clears itself either way.
  composer.onSubmit = (text) => {
    composer.setText('')
    const placed = registrations.placed('composer').at(-1)
    if (placed?.kind !== 'composer') return
    // An author's submit is fenced: what it throws is said in a notice, naming its registration, and the surface stays up.
    try {
      placed.submit(text)
    } catch (error) {
      raise(`binnacle.place(composer) submit threw: ${describe(error)}`, problemWindow)
    }
  }
  const closeGrants = registrations.open({ send: (text) => { session.send(text) } })
  // The one key table, installed so the composer and the alternate screen read it too. It answers a press only, once,
  // wherever keys enter; nothing else in binnacle matches a key. Each placed screen offers its key in it, as a binding.
  const table = keyTable()
  // What a person bound through the registrations, over the defaults, installed wherever keys are read.
  table.bind(registrations.bindings)
  setKeybindings(table.manager)
  const offered = new Map<string, () => void>()
  /** Take back every key the placed screens offer and offer what they offer now, forgetting panes whose registration went, closing one such, and installing the manager the offers rebuilt. */
  function offerScreens(): void {
    for (const withdraw of offered.values()) withdraw()
    offered.clear()
    for (const [id, screen] of registrations.screens) offered.set(id, table.offer(id, { defaultKeys: screen.key, description: screen.description }))
    for (const id of screenPanes.keys()) {
      if (registrations.screens.has(id)) continue
      screenPanes.delete(id)
      screenViews.delete(id)
    }
    setKeybindings(table.manager)
    if (open === undefined) return
    const placed = registrations.screens.get(open.name)
    if (placed === undefined) closeScreen()
    else open.pane.place(open.name, placed)
  }
  offerScreens()
  // Keys arrive ahead of the composer, through pi-tui's input listener. The host answers what is bound to it, quitting
  // and switching screens; the key that opens a placed screen, and what it answers with, is the host's too; a gesture
  // is the pane's to answer — the transcript's, or the placed screen that is open in its place, which holds UI state of
  // its own — and a key nothing answers gives the keyboard back to the composer, reaching it typed, so typing is never
  // lost. While a placed screen is open, Esc returns to the transcript and no gesture moves on it;
  // scrolling, search and selection are the alternate screen's own, and the composer below stays live.
  const keys = (data: string): TuiInputListenerResult => {
    // Lines in the composer's seat that offer something take the keyboard while they stand, ahead of what is being
    // read, their first offer focused as they take it: what they ask is the person's to answer next.
    const seat = page.composer instanceof ScreenPane && page.composer.offering ? page.composer : undefined
    if (seat !== undefined && !seat.focused) seat.handleKey({ kind: 'key', binding: 'focus.next' })
    const reading = seat ?? (open === undefined ? (page.transcript ? transcript : undefined) : open.pane)
    const resolved = table.resolve(data, reading?.focused ?? false, seat === undefined && open !== undefined)
    if (resolved?.kind === 'quit') {
      // Cancel twice to quit: the first stops a running turn and says what a second does; a second while that is said
      // quits, and after it the first press is a first again.
      if (arming !== undefined) {
        quit()
        return { consume: true }
      }
      if (session.running) session.interrupt()
      const quitKeys = table.manager.getKeys('binnacle.quit').join(', ')
      raise(`${quitKeys} again to quit`, quitWindow)
      arming = internals.clock.after(quitWindow, () => { arming = undefined })
      return { consume: true }
    }
    if (resolved?.kind === 'switch-screens') {
      // A placed screen lives in the alternate screen's scroll view; leaving that screen closes it.
      open = undefined
      show(tui.mode === 'fullscreen' ? 'regular' : 'fullscreen')
      return { consume: true }
    }
    if (resolved?.kind === 'screen') {
      if (open?.name === resolved.name) closeScreen()
      else openScreen(resolved.name)
      return { consume: true }
    }
    if (resolved?.kind === 'screen-close') {
      closeScreen()
      return { consume: true }
    }
    // Interrupting is the host's to answer, as quitting is; while nothing runs, the key is the composer's, as any key
    // nothing answers.
    if (resolved?.kind === 'interrupt' && session.running) {
      session.interrupt()
      return { consume: true }
    }
    if (resolved?.kind === 'gesture' && reading?.handleKey({ kind: 'key', binding: resolved.binding }) === true) return { consume: true }
    // A key a person bound to an affordance is answered even where focus offers no such thing: it does nothing there,
    // and focus stays.
    if (resolved?.kind === 'gesture' && resolved.binding in affordances) return { consume: true }
    // Stepping out drops focus, and where the main screen parked it, so what was typed is sent, not answered by focus.
    reading?.handleKey({ kind: 'key', binding: 'focus.out' })
    return undefined
  }
  // While the fullscreen's scroll view is scrolled away from the end it follows, pi-tui's indicator says so on the
  // view's last row (`pi:packages/tui/src/tui-alt-screen.ts`): the label names the key the one key table binds to
  // pi-tui's `tui.altScreen.bottom`, which pi-tui itself — or a click on the label — answers by bringing the end back.
  const jumpToLatest = (): string => {
    const bound = table.manager.getKeys('tui.altScreen.bottom').join(', ')
    const theme = registrations.currentTheme
    return theme.tones.accent(` ${theme.chrome.jump} Jump to latest · ${bound} `)
  }
  const build = (mode: TuiMode): TuiMainScreen | TuiAltScreen => {
    transcript.drawOn(mode)
    const next = mode === 'regular' ? new TuiMainScreen(terminal) : new TuiAltScreen(terminal, undefined, undefined, { scrollToEndIndicator: jumpToLatest })
    if (next instanceof TuiMainScreen && left !== undefined) next.restoreRenderState(left)
    if (next instanceof TuiMainScreen) scroll = undefined
    stack(next)
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
    // Focus the main screen parked comes back with the fullscreen, and is brought into view there.
    if (mode === 'fullscreen') transcript.reveal()
  }
  tui = build(first)
  const unfollow = session.follow((event) => {
    events.push(event)
    const fact = adapt(event, registrations.adapters)
    facts.push(fact)
    transcript.push(fact)
    for (const pane of screenPanes.values()) pane.factsChanged()
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
  })
  let held = true
  let started = false
  const release = (): void => {
    if (!held) return
    held = false
    unfollow()
    unstand()
    unraise?.()
    arming?.()
    closeGrants()
    unregister()
    // A placed screen open at the quit is closed first, so the session is left where the person can read it, plain.
    if (open !== undefined) closeScreen()
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
  // The built-in features, loaded beside the surface they draw on: each holds only what an author holds, and its registrations are effects of its own fiber.
  ctx.plugin(transcriptFeature)
  ctx.plugin(composerFeature)
  ctx.plugin(approvals)
  ctx.plugin(statusLine)
  ctx.plugin(toolCards)
  ctx.plugin(trajectory)
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
