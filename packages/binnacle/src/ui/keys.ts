/**
 * The key table: the one place key bytes are matched to what they do.
 *
 * binnacle's bindings are declared on pi-tui's `Keybindings` by declaration
 * merging and held in one `KeybindingsManager` together with pi-tui's own,
 * so the composer and the alternate screen read the same table; the keys
 * plugins offer for screens they placed join it as bindings of their own,
 * and the manager is rebuilt as offers come and go. Installing the manager
 * is the host's, again whenever an offer changes it. The table answers a
 * press only, once: a repeat or a release, which a kitty-protocol terminal
 * also reports, is answered by nothing binnacle binds.
 */

import { isKeyRepeat, isKeyRelease, KeybindingsManager, TUI_KEYBINDINGS } from '@earendil-works/pi-tui'
import type { Keybinding, KeybindingDefinition, KeybindingDefinitions, KeybindingsConfig } from '@earendil-works/pi-tui'
import { affordances } from '../contract/index.ts'
import type { AffordanceKind, KeyBinding } from '../contract/index.ts'

/** A key as pi-tui names it, re-exported for the author API: what a plugin offers to open a screen with. */
export type { KeyId } from '@earendil-works/pi-tui'

/** A binding for each affordance kind, by the kind's name: what a key bound to it invokes on the focused region. */
type AffordanceKeybindings = { readonly [Kind in AffordanceKind as `binnacle.${Kind}`]: true }

/** binnacle's bindings, merged into pi-tui's table so one manager holds them all. */
export interface BinnacleKeybindings extends AffordanceKeybindings {
  'binnacle.quit': true
  'binnacle.switchScreens': true
  'binnacle.stepIn': true
  'binnacle.focusNext': true
  'binnacle.focusPrevious': true
  'binnacle.primary': true
  'binnacle.stepOut': true
}

declare module '@earendil-works/pi-tui' {
  interface Keybindings extends BinnacleKeybindings {}
}

/** binnacle's own bindings alone, in the order a person reads them in help. */
export const BINNACLE_BINDINGS = {
  'binnacle.stepIn': { defaultKeys: 'shift+tab', description: 'step in: focus the nearest thing that offers something' },
  'binnacle.focusNext': { defaultKeys: ['tab', 'down'], description: 'focus the next thing that offers something' },
  'binnacle.focusPrevious': { defaultKeys: 'up', description: 'focus the previous thing that offers something' },
  'binnacle.primary': { defaultKeys: 'enter', description: 'do what the focused thing offers first' },
  'binnacle.stepOut': { defaultKeys: 'escape', description: 'give the keyboard back to the composer' },
  'binnacle.quit': { defaultKeys: 'ctrl+c', description: 'quit' },
  'binnacle.switchScreens': { defaultKeys: 'ctrl+t', description: 'switch screens' },
} as const satisfies KeybindingDefinitions

/**
 * A binding for each affordance kind, unbound until a person binds it: a key bound to one invokes that affordance on
 * the focused region where it is offered (ADR 1). Every kind the contract has must be here, or this does not compile.
 */
export const AFFORDANCE_BINDINGS: { readonly [Kind in AffordanceKind as `binnacle.${Kind}`]: KeybindingDefinition } = {
  'binnacle.expand': { defaultKeys: [], description: 'open or fold the focused thing' },
  'binnacle.choose': { defaultKeys: [], description: 'choose the focused option' },
  'binnacle.open': { defaultKeys: [], description: 'open the focused thing where it leads' },
  'binnacle.copy': { defaultKeys: [], description: 'copy the focused thing' },
  'binnacle.answer': { defaultKeys: [], description: 'answer the focused question' },
  'binnacle.grant': { defaultKeys: [], description: 'grant what the focused thing asks' },
  'binnacle.dismiss': { defaultKeys: [], description: 'dismiss the focused thing' },
}

/** Every binding the table holds: pi-tui's own, then binnacle's, then one for each affordance kind. */
export const KEYBINDINGS = {
  ...TUI_KEYBINDINGS,
  ...BINNACLE_BINDINGS,
  ...AFFORDANCE_BINDINGS,
} as const satisfies KeybindingDefinitions

/** What the table resolves a key to: a key gesture's binding, one of the host's own, or a placed screen's. */
export type ResolvedKey =
  | { readonly kind: 'gesture', readonly binding: KeyBinding }
  | { readonly kind: 'quit' }
  | { readonly kind: 'switch-screens' }
  | { readonly kind: 'screen', readonly name: string }
  | { readonly kind: 'screen-close' }

/** The binding id a placed screen's key is offered under: the one table's, named for the screen. */
const offeredBinding = (name: string): string => `binnacle.screen.${name}`

/** The one key table. */
export interface KeyTable {
  /** The manager holding every binding, for the host to install with pi-tui's `setKeybindings`. */
  readonly manager: KeybindingsManager
  /**
   * What a key resolves to. The bindings live in the context in a fixed order, and within it a binding the person
   * set resolves before one that only defaults to the same key, so an explicit binding is never defeated by a
   * default that shares its key.
   * @param data - the key's bytes, as the terminal reported them.
   * @param focused - whether something on the screen being read — the transcript, or a placed screen that is open — has focus, which decides which bindings are live.
   * @param open - whether a placed screen is open, which takes the keys the transcript would answer.
   * @returns what the key resolved to, or undefined when nothing binnacle binds answers it.
   */
  readonly resolve: (data: string, focused: boolean, open?: boolean) => ResolvedKey | undefined
  /**
   * Offer the key that opens a placed screen, as a binding in this table, so a person can rebind it. The manager is
   * rebuilt with the offer; installing it is the host's, which reads `manager` as it now stands.
   * @param name - the placed screen's name.
   * @param definition - the key it opens with, and its description, as any binding's.
   * @returns a function that withdraws the offer.
   */
  readonly offer: (name: string, definition: KeybindingDefinition) => () => void
  /**
   * Bind keys as a person asked, over the defaults, by binding id; what an earlier call bound and this one leaves out
   * returns to its default. The manager is rebuilt with them; installing it is the host's.
   * @param bindings - each binding id, and the key or keys it answers to now.
   */
  readonly bind: (bindings: KeybindingsConfig) => void
}

/**
 * Build the one key table.
 * @returns the table, holding a manager of its own.
 */
export function keyTable(): KeyTable {
  const offered = new Map<string, KeybindingDefinition>()
  let manager = new KeybindingsManager(KEYBINDINGS)
  let set: KeybindingsConfig = {}
  /**
   * Build the manager again: a new manager is the only way a binding joins the table.
   * @param bindings - what the person bound, over the defaults.
   */
  const rebuild = (bindings: KeybindingsConfig = manager.getUserBindings()): void => {
    manager = new KeybindingsManager({ ...KEYBINDINGS, ...Object.fromEntries(offered) }, bindings)
    set = manager.getUserBindings()
  }
  return {
    get manager(): KeybindingsManager {
      return manager
    },
    bind: (bindings: KeybindingsConfig): void => { rebuild(bindings) },
    offer: (name: string, definition: KeybindingDefinition): () => void => {
      const id = offeredBinding(name)
      offered.set(id, definition)
      rebuild()
      return () => {
        offered.delete(id)
        rebuild()
      }
    },
    resolve: (data: string, focused: boolean, open = false): ResolvedKey | undefined => {
      if (isKeyRelease(data) || isKeyRepeat(data)) return undefined
      // The bindings live in this context, in the order the table resolves them: the host's own everywhere, then a
      // placed screen's key, its closing while one is open, step in, and — while something has focus — moving focus,
      // the primary and step out, then one binding per affordance kind. A placed screen takes the keys the transcript
      // would answer, on itself rather than the transcript beneath; only Esc differs, returning to the transcript,
      // and it is resolved before the gestures both screens share, which the rest of the order gives. Scrolling,
      // search and selection are the alternate screen's own, over the scroll view the screen sits in; the composer
      // below it stays live, and focus does not move on the transcript beneath.
      const live: { readonly id: Keybinding, readonly to: ResolvedKey }[] = [
        { id: 'binnacle.quit', to: { kind: 'quit' } },
        { id: 'binnacle.switchScreens', to: { kind: 'switch-screens' } },
      ]
      for (const id of offered.keys()) live.push({ id: id as Keybinding, to: { kind: 'screen', name: id.slice(offeredBinding('').length) } })
      if (open) live.push({ id: 'binnacle.stepOut', to: { kind: 'screen-close' } })
      live.push({ id: 'binnacle.stepIn', to: { kind: 'gesture', binding: 'focus.previous' } })
      if (focused) {
        live.push(
          { id: 'binnacle.focusNext', to: { kind: 'gesture', binding: 'focus.next' } },
          { id: 'binnacle.focusPrevious', to: { kind: 'gesture', binding: 'focus.previous' } },
          { id: 'binnacle.primary', to: { kind: 'gesture', binding: 'primary' } },
          { id: 'binnacle.stepOut', to: { kind: 'gesture', binding: 'focus.out' } },
        )
        for (const kind of Object.keys(affordances) as AffordanceKind[]) live.push({ id: `binnacle.${kind}` as Keybinding, to: { kind: 'gesture', binding: kind } })
      }
      // What the person set resolves before what only defaults to the same key, within that order; two ids the
      // registrations leave on one key keep the order, whichever the person set.
      const explicit = live.filter(({ id }) => Object.hasOwn(set, id) && set[id] !== undefined)
      return (explicit.find(({ id }) => manager.matches(data, id)) ?? live.find(({ id }) => manager.matches(data, id)))?.to
    },
  }
}

/**
 * Why a person's bindings cannot stand, as what to change: an id no binding of binnacle's or pi-tui's own has — a name
 * only the prototype chain gives is no binding — a key that is no string, or two ids come to share one key. A placed
 * screen's id stands whether or not its screen is placed yet. Two ids sharing a key is what pi-tui's manager reports
 * as a conflict among a person's bindings, taken from it rather than found again; whether a string names a key is
 * pi-tui's to say, and it exports nothing that says it, so only a key that is no string is refused here.
 * @param bindings - everything a person bound, together.
 * @returns the reason, or undefined when they stand.
 */
export function refusedBindings(bindings: KeybindingsConfig): string | undefined {
  const screens: Record<string, KeybindingDefinition> = {}
  for (const [id, keys] of Object.entries(bindings)) {
    if (id.startsWith(offeredBinding(''))) screens[id] = { defaultKeys: [] }
    else if (!Object.hasOwn(KEYBINDINGS, id)) return `${id} is no binding; bind one pi-tui or binnacle has, a placed screen's ${offeredBinding('<name>')}, or an affordance's binnacle.<kind>`
    const named = Array.isArray(keys) ? keys : [keys]
    if (named.some(key => typeof key !== 'string')) return `${id} is bound to ${String(keys)}; bind it to a key as pi-tui names one, such as ctrl+q, or a list of them`
  }
  const conflict = new KeybindingsManager({ ...KEYBINDINGS, ...screens }, bindings).getConflicts()[0]
  if (conflict === undefined) return undefined
  return `${conflict.key} is bound to both ${conflict.keybindings.join(' and ')}; bind one of them to another key`
}
