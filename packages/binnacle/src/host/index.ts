import { Command, Option } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CombinedAutocompleteProvider, Editor, ProcessTerminal, ScrollView, setKeybindings, TuiAltScreen, TuiMainScreen, VStack } from '@earendil-works/pi-tui'
import type { Component, Keybinding, OverlayHandle, Terminal, TUI, TuiInputListenerResult, TuiMainScreenRenderState, TuiMode, StackChild } from '@earendil-works/pi-tui'
import { adapt } from '../facts/adapt.ts'
import type { Fact } from '../facts/adapt.ts'
import { editorTheme } from '../ui/theme.ts'
import { AFFORDANCE_BINDINGS, BINNACLE_BINDINGS, keyTable } from '../ui/keys.ts'
import { affordances, describe } from '../contract/index.ts'
import { TranscriptPane } from '../panes/transcript.ts'
import { ScreenPane } from '../panes/screen.ts'
import type { Placement, Slot, Surface } from '../api.ts'
import { approvals } from '../plugins/approvals/index.ts'
import { questions } from '../plugins/questions/index.ts'
import { RegistrationService } from './registrations.ts'
import { openSession } from './session.ts'
import type { OpenedSession } from './session.ts'
import type { Scope } from '@deepseek-ai/dsh-scope'

export const name = 'binnacle'

export const inject = ['cmdlineArgs', 'agents', 'agentDefaultModel', 'commands'] satisfies (keyof Context)[]

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

interface Page {
  readonly transcript: boolean
  /** Oldest first. */
  readonly above: readonly Component[]
  readonly composer: Component | undefined
  /** Oldest first. */
  readonly below: readonly Component[]
  /** The newest lines placed in the dialog. */
  readonly dialog: ScreenPane | undefined
}

/** How long a first Ctrl+C waits for a second to quit, in milliseconds. */
const quitWindow = 3_000

/** How long a notice saying what went wrong stands, in milliseconds. */
const problemWindow = 5_000

/** What the alternate screen's reading place holds when neither the transcript nor a screen is placed there: nothing, growing. */
const nothing: Component = { render: () => [], invalidate: () => {} }

type Mode = 'check' | TuiMode

/**
 * Read from the one table, never restated. dsh parses the command line as the row applies
 * (`dsh:packages/boot/cmdline/src/index.ts#parseCmdline`), before any plugin has registered, so what plugins offer or
 * rebind is not here.
 */
function keysHelp(): string {
  const { manager } = keyTable()
  const named = [...Object.keys(BINNACLE_BINDINGS), ...Object.keys(AFFORDANCE_BINDINGS)].map((id) => {
    const keys = manager.getKeys(id as Keybinding).join(', ')
    return `  ${keys === '' ? '(unbound)' : keys}  ${manager.getDefinition(id as Keybinding)?.description ?? ''}`
  })
  return `Keys:\n${named.join('\n')}`
}

/** A fresh program each call, so one process can parse more than once. */
function surfaceCommand(chosen: (mode: Mode) => void): Command {
  return new Command()
    .name('dsh --profile binnacle')
    .description('Open a terminal session with an agent. Ctrl+T switches screens; Ctrl+C stops a running turn, and twice quits.')
    .helpOption('-h, --help', 'show this help')
    .addHelpText('after', `\n${keysHelp()}`)
    .option('--check', 'open a session on the default model, report it, close it, and exit, drawing nothing')
    .addOption(new Option('--tui-mode <mode>', 'the screen to start on: fullscreen, the alternate screen, or regular, the main screen and its scrollback').choices(['regular', 'fullscreen']).default('fullscreen'))
    .action((options: { check?: boolean, tuiMode: TuiMode }) => { chosen(options.check === true ? 'check' : options.tuiMode) })
}

/**
 * A pi-tui object that reaches whichever is live, for a component built with
 * one, as pi's are (`pi:packages/coding-agent/src/modes/interactive/tui-renderer.ts#createInteractiveTuiReference`).
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
 * A switch stops the live pi-tui object and builds the other over the same
 * terminal, as pi does (`pi:packages/coding-agent/src/modes/interactive/interactive-mode.ts`).
 * What the old one held is carried to the new: the pane and the composer,
 * focus, the one key table's listener, and the transcript's scroll view with
 * its scroll. A placed screen does not carry: it lives in the alternate
 * screen's scroll view, and leaving that screen closes it. Where the main
 * screen left off is kept for its next turn, as the terminal keeps what it
 * printed. `quit` is called once, when the person asks to quit. Returns a disposer that gives the terminal back, the session left printed on the main screen; throws what starting the terminal threw, having given back what it took.
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
  }, () => registrations.currentTheme, () => internals.clock.now(), () => table.keysOf)
  // The screens plugins placed, each in a pane of its own with a scroll view of its own, so what a person did to
  // one — where they scrolled it — is kept while its registration stands. One is open at a time: it takes the
  // transcript's place in the alternate screen's scroll view, so pi-tui's scrolling, search and selection read it
  // as they read the transcript; the composer below is untouched, and stays live.
  const screenPanes = new Map<string, ScreenPane>()
  const screenViews = new Map<string, ScrollView>()
  let followed: ScrollView | undefined
  let open: { readonly name: string, readonly pane: ScreenPane, readonly on: TuiMode } | undefined
  /** Kept for as long as the terminal is taken, so its scroll survives a placed screen and a switch. */
  function transcriptView(): ScrollView {
    if (followed === undefined) {
      followed = new ScrollView(transcript, { follow: 'end', primary: true })
      scroll = followed
    }
    return followed
  }
  const readBelowComposer = (reading: ScrollView | undefined): VStack => new VStack([
    { component: reading ?? nothing, basis: 0, grow: 1, shrink: 1, minSize: reading === undefined ? 0 : 1 },
    ...around().map((component): StackChild => ({ component, basis: 'auto', grow: 0, shrink: 1, minSize: component === composer ? 3 : 0 })),
  ])
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
  let dialog: OverlayHandle | undefined
  const linesPane = (slot: Slot, placement: Extract<Placement, { readonly kind: 'lines' }>): ScreenPane => {
    const inSlot = linesPanes.get(slot) ?? new Map<Placement, ScreenPane>()
    linesPanes.set(slot, inSlot)
    const kept = inSlot.get(placement)
    if (kept !== undefined) return kept
    // Lines are drawn as a placed screen is, UI state and all, so what they offer answers a person through the one
    // gesture table; an offer UI state does not answer reaches the placement's invoke. Keys reach only the composer's
    // seat and the dialog, so only an ask there names them; elsewhere the pointer alone answers.
    const answered = slot === 'composer' || slot === 'dialog'
    const pane = new ScreenPane(() => facts, {
      changed: () => { tui.requestRender() },
      invoked: (region, affordance) => { placement.invoke?.(region, affordance) },
    }, () => registrations.currentTheme, () => internals.clock.now(), () => answered ? table.keysOf : undefined)
    pane.place(slot, { draw: drawn => placement.draw(drawn, surface()) }, `binnacle.place(${slot})`)
    inSlot.set(placement, pane)
    return pane
  }
  function arrange(): Page {
    const lines = (slot: Slot): readonly ScreenPane[] => registrations.placed(slot).flatMap(placement => placement.kind === 'lines' ? [linesPane(slot, placement)] : [])
    const inComposer = registrations.placed('composer').at(-1)
    const inDialog = registrations.placed('dialog').at(-1)
    const arranged: Page = {
      transcript: registrations.placed('transcript').at(-1)?.kind === 'transcript',
      above: lines('above-composer'),
      composer: inComposer === undefined ? undefined : inComposer.kind === 'lines' ? linesPane('composer', inComposer) : composer,
      below: lines('below-composer'),
      dialog: inDialog?.kind === 'lines' ? linesPane('dialog', inDialog) : undefined,
    }
    const standing = new Set<Component | undefined>([...arranged.above, arranged.composer, ...arranged.below, arranged.dialog])
    for (const [slot, panes] of linesPanes) {
      for (const [placement, pane] of panes) if (!standing.has(pane)) panes.delete(placement)
      if (panes.size === 0) linesPanes.delete(slot)
    }
    return arranged
  }
  const around = (): readonly Component[] => [...page.above, ...(page.composer === undefined ? [] : [page.composer]), ...page.below]
  function stack(on: TuiMainScreen | TuiAltScreen): void {
    unshowDialog()
    on.clear()
    if (page.transcript) on.addChild(transcript)
    for (const component of around()) on.addChild(component)
    if (on instanceof TuiAltScreen) readOn(on)
    on.setFocus(page.composer === composer ? composer : null)
    // The dialog takes no focus of pi-tui's: the host hands it keys, ahead of the composer's seat, as it hands the seat.
    if (page.dialog !== undefined) dialog = on.showOverlay(page.dialog, { anchor: 'center', width: '80%', maxHeight: '80%', nonCapturing: true })
  }
  /** Clearing a screen leaves its overlays standing. */
  function unshowDialog(): void {
    dialog?.hide()
    dialog = undefined
  }
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
    open = undefined
    let pane = screenPanes.get(id)
    if (pane === undefined) {
      pane = new ScreenPane(() => facts, { changed: () => { tui.requestRender() }, inView: intoView }, () => registrations.currentTheme, () => internals.clock.now(), () => table.keysOf)
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
      // An ask names the keys that answer it, so what is drawn is laid out again with the keys as they now stand.
      transcript.invalidate()
      for (const pane of screenPanes.values()) pane.invalidate()
      tui.requestRender()
    } else if (changed === 'drawn') {
      // What a plugin's drawings read changed where no session event says so; its lines are drawn again above, its placed screens here.
      for (const pane of screenPanes.values()) pane.invalidate()
      tui.requestRender()
    } else if (changed === 'placements') {
      page = arrange()
      stack(tui)
      tui.requestRender()
    } else tui.requestRender()
  })
  // Where the session stands, as the session reads it live, with the notice the host raises laid over it: what lines
  // are handed, and drawn again as it changes.
  let notice: string | undefined
  const surface = (): Surface => notice === undefined ? {} : { notice }
  const restand = (): void => {
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
    tui.requestRender()
  }
  const unstand = session.onStanding(restand)
  // While what the transcript drew holds the time since a moment, a frame each second draws it at the time; an entry
  // that holds none is laid out once for all times. A placed screen or a placed line that drew one ticks the same.
  const ticking = (): boolean => transcript.ticking
    || [...screenPanes.values()].some(pane => pane.ticking)
    || [...linesPanes.values()].some(panes => [...panes.values()].some(pane => pane.ticking))
  let untick: (() => void) | undefined
  const tick = (): void => {
    if (ticking()) tui.requestRender()
    untick = internals.clock.after(1_000, tick)
  }
  untick = internals.clock.after(1_000, tick)
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
  // What `/` completes in binnacle's composer: dsh's commands and the skills a person may invoke, read as the session
  // opens and again as dsh says either changed, through pi-tui's own provider.
  const offer = (): void => {
    session.offers().then((offers) => {
      composer.setAutocompleteProvider(new CombinedAutocompleteProvider([...offers], process.cwd()))
    }, () => {
      // A catalog that cannot be read leaves `/` offering what it offered before: a stale list costs completions, never a command.
    })
  }
  offer()
  const unoffer = session.onOffers(offer)
  const closeGrants = registrations.open({ send: (text) => { session.send(text) }, command: line => session.command(line), agent: session.agent })
  // The one key table, installed so the composer and the alternate screen read it too. It answers a press only, once,
  // wherever keys enter; nothing else in binnacle matches a key. Each placed screen offers its key in it, as a binding.
  const table = keyTable()
  table.bind(registrations.bindings)
  setKeybindings(table.manager)
  const offered = new Map<string, () => void>()
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
    // read, their first offer focused as they take it: what they ask is the person's to answer next. A dialog that
    // offers something takes it ahead of the seat, as it stands over the page.
    const seat = page.dialog?.offering === true
      ? page.dialog
      : page.composer instanceof ScreenPane && page.composer.offering ? page.composer : undefined
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
      if (session.agent.status === 'running') session.interrupt()
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
    if (resolved?.kind === 'interrupt' && session.agent.status === 'running') {
      session.interrupt()
      return { consume: true }
    }
    if (resolved?.kind === 'gesture' && (seat === undefined ? reading?.handleKey({ kind: 'key', binding: resolved.binding }) : seat.handleKey({ kind: 'key', binding: resolved.binding }, true)) === true) return { consume: true }
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
    unshowDialog()
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
    untick?.()
    unoffer()
    closeGrants()
    unregister()
    // The dialog goes with the surface, so the session is left printed without it.
    page = { ...page, dialog: undefined }
    unshowDialog()
    // A placed screen open at the quit is closed first, so the session is left where the person can read it, plain.
    if (open !== undefined) closeScreen()
    // Quitting from the alternate screen goes by the main screen, as pi's does, so the session is left printed there once, after what it printed before.
    if (started && tui.mode === 'fullscreen') {
      leave()
      tui = build('regular')
      tui.renderNow()
    } else if (started) tui.renderNow()
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

/** A failure it cannot recover from gives back what it took, a terminal half-started included, says what failed, and asks the launcher to exit 1. */
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
  // Approvals and Questions answer for the session's agent alone: applied on a scope of that agent once the session opens, so another agent's ask never reaches them and fails closed elsewhere (`dsh:packages/core/scope/src/index.ts#createScope`).
  let agentScope: Scope | undefined
  const close = async (): Promise<void> => {
    // The approvals scope goes first, so a request still standing is answered and its card unseated before the terminal is given back — the session is left printed without it.
    const scope = agentScope
    agentScope = undefined
    await scope?.dispose()
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
      internals.stdout.write(`binnacle: ok (${opened.agent.options.provider}/${opened.agent.options.model})\n`)
      quit()
      return
    }
    agentScope = createScope(ctx, opened.agent)
    void agentScope.ctx.plugin(approvals)
    void agentScope.ctx.plugin(questions)
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
