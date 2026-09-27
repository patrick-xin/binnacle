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
import type { Keybinding, KeybindingDefinition, KeybindingDefinitions } from '@earendil-works/pi-tui'
import type { KeyBinding } from '../contract/index.ts'

/** A key as pi-tui names it, re-exported for the author API: what a plugin offers to open a screen with. */
export type { KeyId } from '@earendil-works/pi-tui'

/** binnacle's bindings, merged into pi-tui's table so one manager holds them all. */
export interface BinnacleKeybindings {
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

/** Every binding the table holds: pi-tui's own, then binnacle's. */
export const KEYBINDINGS = {
  ...TUI_KEYBINDINGS,
  ...BINNACLE_BINDINGS,
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
   * What a key resolves to.
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
}

/**
 * Build the one key table.
 * @returns the table, holding a manager of its own.
 */
export function keyTable(): KeyTable {
  const offered = new Map<string, KeybindingDefinition>()
  let manager = new KeybindingsManager(KEYBINDINGS)
  const rebuild = (): void => {
    // A new manager is the only way a binding joins the table; what the person rebound is carried to it.
    manager = new KeybindingsManager({ ...KEYBINDINGS, ...Object.fromEntries(offered) }, manager.getUserBindings())
  }
  return {
    get manager(): KeybindingsManager {
      return manager
    },
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
      if (manager.matches(data, 'binnacle.quit')) return { kind: 'quit' }
      if (manager.matches(data, 'binnacle.switchScreens')) return { kind: 'switch-screens' }
      for (const id of offered.keys()) {
        if (manager.matches(data, id as Keybinding)) return { kind: 'screen', name: id.slice(offeredBinding('').length) }
      }
      if (open) {
        // A placed screen takes the keys the transcript would answer, on itself rather than the transcript beneath:
        // step in, and with something on it focused, movement and the primary affordance. Esc returns to the
        // transcript. Scrolling, search and selection are the alternate screen's own, over the scroll view the
        // screen sits in; the composer below it stays live, and focus does not move on the transcript beneath.
        if (manager.matches(data, 'binnacle.stepOut')) return { kind: 'screen-close' }
        if (manager.matches(data, 'binnacle.stepIn')) return { kind: 'gesture', binding: 'focus.previous' }
        if (focused) {
          if (manager.matches(data, 'binnacle.focusNext')) return { kind: 'gesture', binding: 'focus.next' }
          if (manager.matches(data, 'binnacle.focusPrevious')) return { kind: 'gesture', binding: 'focus.previous' }
          if (manager.matches(data, 'binnacle.primary')) return { kind: 'gesture', binding: 'primary' }
        }
        return undefined
      }
      if (manager.matches(data, 'binnacle.stepIn')) return { kind: 'gesture', binding: 'focus.previous' }
      if (focused) {
        if (manager.matches(data, 'binnacle.focusNext')) return { kind: 'gesture', binding: 'focus.next' }
        if (manager.matches(data, 'binnacle.focusPrevious')) return { kind: 'gesture', binding: 'focus.previous' }
        if (manager.matches(data, 'binnacle.primary')) return { kind: 'gesture', binding: 'primary' }
        if (manager.matches(data, 'binnacle.stepOut')) return { kind: 'gesture', binding: 'focus.out' }
      }
      return undefined
    },
  }
}
