import { Command, Option } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CombinedAutocompleteProvider, Editor, getNativeClipboard, ProcessTerminal, ScrollView, setKeybindings, TuiAltScreen, TuiMainScreen, VStack } from '@earendil-works/pi-tui'
import type { Component, Keybinding, NativeClipboard, OverlayHandle, Terminal, TUI, TuiInputListenerResult, TuiMainScreenRenderState, TuiMode, StackChild } from '@earendil-works/pi-tui'
import { adapt } from '../facts/adapt.ts'
import type { Fact } from '../facts/adapt.ts'
import { AnswerStream } from '../facts/stream.ts'
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

export const internals: {
  terminal: () => Terminal
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  open: (ctx: Context) => Promise<OpenedSession>
  clock: { now(): number, after(ms: number, then: () => void): () => void }
  clipboard: () => NativeClipboard | undefined
} = {
  terminal: () => new ProcessTerminal(),
  stdout: process.stdout,
  stderr: process.stderr,
  open: openSession,
  clipboard: getNativeClipboard,
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
  readonly above: readonly Component[]
  readonly composer: Component | undefined
  readonly below: readonly Component[]
  readonly dialog: ScreenPane | undefined
}

const quitWindow = 3_000

const problemWindow = 5_000

const nothing: Component = { render: () => [], invalidate: () => {} }

type Mode = 'check' | TuiMode

function keysHelp(): string {
  const { manager } = keyTable()
  const named = [...Object.keys(BINNACLE_BINDINGS), ...Object.keys(AFFORDANCE_BINDINGS)].map((id) => {
    const keys = manager.getKeys(id as Keybinding).join(', ')
    return `  ${keys === '' ? '(unbound)' : keys}  ${manager.getDefinition(id as Keybinding)?.description ?? ''}`
  })
  return `Keys:\n${named.join('\n')}`
}

// Each call rebuilds to allow multiple parses in one process.
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

function reaching(live: () => TUI): TUI {
  return new Proxy({} as TUI, {
    get: (_target, property) => {
      const tui = live()
      const value: unknown = Reflect.get(tui, property, tui)
      return typeof value === 'function' ? value.bind(tui) : value
    },
  })
}

function takeTerminal(session: OpenedSession, registrations: RegistrationService, quit: () => void, first: TuiMode): () => void {
  const terminal = internals.terminal()
  const events: SessionEvent[] = []
  const facts: Fact[] = []
  let tui: TuiMainScreen | TuiAltScreen
  let left: TuiMainScreenRenderState | undefined
  let scroll: ScrollView | undefined
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
    copy: (text) => {
      const byTerminal = (): void => { terminal.write(`\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`) }
      const native = internals.clipboard()
      if (native?.setText === undefined) byTerminal()
      else native.setText(text).catch(byTerminal)
    },
  }, () => registrations.currentTheme, () => internals.clock.now(), () => table.keysOf)
  const screenPanes = new Map<string, ScreenPane>()
  const screenViews = new Map<string, ScrollView>()
  let followed: ScrollView | undefined
  let open: { readonly name: string, readonly pane: ScreenPane, readonly on: TuiMode } | undefined
  // Kept to preserve scroll state across screen switches.
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
  const linesPanes = new Map<Slot, Map<Placement, ScreenPane>>()
  let dialog: OverlayHandle | undefined
  const linesPane = (slot: Slot, placement: Extract<Placement, { readonly kind: 'lines' }>): ScreenPane => {
    const inSlot = linesPanes.get(slot) ?? new Map<Placement, ScreenPane>()
    linesPanes.set(slot, inSlot)
    const kept = inSlot.get(placement)
    if (kept !== undefined) return kept
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
    if (page.dialog !== undefined) dialog = on.showOverlay(page.dialog, { anchor: 'center', width: '80%', maxHeight: '80%', nonCapturing: true })
  }
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
  // Adapters change the facts, so the log is read again; views and the theme need only a frame.
  const unregister = registrations.onChange((changed) => {
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
    if (changed === 'facts') {
      facts.length = 0
      for (const event of events) facts.push(adapt(event, registrations.adapters))
      transcript.reset(facts)
      for (const pane of screenPanes.values()) pane.factsChanged()
    } else if (changed === 'screens') offerScreens()
    else if (changed === 'keys') {
      table.bind(registrations.bindings)
      setKeybindings(table.manager)
      transcript.invalidate()
      for (const pane of screenPanes.values()) pane.invalidate()
      tui.requestRender()
    } else if (changed === 'drawn') {
      for (const pane of screenPanes.values()) pane.invalidate()
      tui.requestRender()
    } else if (changed === 'placements') {
      page = arrange()
      stack(tui)
      tui.requestRender()
    } else tui.requestRender()
  })
  let notice: string | undefined
  const surface = (): Surface => notice === undefined ? {} : { notice }
  const restand = (): void => {
    for (const panes of linesPanes.values()) for (const pane of panes.values()) pane.invalidate()
    tui.requestRender()
  }
  const unstand = session.onStanding(restand)
  const ticking = (): boolean => transcript.ticking
    || [...screenPanes.values()].some(pane => pane.ticking)
    || [...linesPanes.values()].some(panes => [...panes.values()].some(pane => pane.ticking))
  let untick: (() => void) | undefined
  const tick = (): void => {
    if (ticking()) tui.requestRender()
    untick = internals.clock.after(1_000, tick)
  }
  untick = internals.clock.after(1_000, tick)
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
    // Errors during submit are fenced and shown in a notice.
    try {
      placed.submit(text)
    } catch (error) {
      raise(`binnacle.place(composer) submit threw: ${describe(error)}`, problemWindow)
    }
  }
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
  const keys = (data: string): TuiInputListenerResult => {
    const seat = page.dialog?.offering === true
      ? page.dialog
      : page.composer instanceof ScreenPane && page.composer.offering ? page.composer : undefined
    if (seat !== undefined && !seat.focused) seat.handleKey({ kind: 'key', binding: 'focus.next' })
    const reading = seat ?? (open === undefined ? (page.transcript ? transcript : undefined) : open.pane)
    const resolved = table.resolve(data, reading?.focused ?? false, seat === undefined && open !== undefined)
    if (resolved?.kind === 'quit') {
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
    if (resolved?.kind === 'interrupt' && session.agent.status === 'running') {
      session.interrupt()
      return { consume: true }
    }
    if (resolved?.kind === 'gesture' && (seat === undefined ? reading?.handleKey({ kind: 'key', binding: resolved.binding }) : seat.handleKey({ kind: 'key', binding: resolved.binding }, true)) === true) return { consume: true }
    if (resolved?.kind === 'gesture' && resolved.binding in affordances) return { consume: true }
    reading?.handleKey({ kind: 'key', binding: 'focus.out' })
    return undefined
  }
  // Names the key bound to `tui.altScreen.bottom`, so a rebind shows in the scrolled-away label.
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
  const answering = new AnswerStream()
  const unstream = session.onStream((frame) => {
    answering.read(frame)
    transcript.stream(answering.answer)
  })
  let held = true
  let started = false
  const release = (): void => {
    if (!held) return
    held = false
    unfollow()
    unstream()
    transcript.stream(undefined)
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
    // Placed screen is closed first so session is left where it can be read plainly.
    if (open !== undefined) closeScreen()
    // When quitting from fullscreen, switch to main screen to show the session.
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
