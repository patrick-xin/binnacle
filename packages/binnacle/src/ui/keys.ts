/**
 * The key table: the one place key bytes are matched to what they do.
 *
 * binnacle's bindings are declared on pi-tui's `Keybindings` by declaration
 * merging and held in one `KeybindingsManager` together with pi-tui's own,
 * so the composer and the alternate screen read the same table. The table
 * answers a press only, once: a repeat or a release, which a kitty-protocol
 * terminal also reports, is answered by nothing binnacle binds
 * ([ADR 13](../../../../docs/adr/0013-a-key-means-something-only-through-the-one-key-table.md)).
 */

import { isKeyRepeat, isKeyRelease, KeybindingsManager, TUI_KEYBINDINGS } from '@earendil-works/pi-tui'
import type { KeybindingDefinitions } from '@earendil-works/pi-tui'
import type { KeyBinding } from '../contract/index.ts'

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

/** Every binding the table holds: pi-tui's own, then binnacle's. */
export const KEYBINDINGS = {
  ...TUI_KEYBINDINGS,
  'binnacle.quit': { defaultKeys: 'ctrl+c', description: 'Quit' },
  'binnacle.switchScreens': { defaultKeys: 'ctrl+t', description: 'Switch screens' },
  'binnacle.stepIn': { defaultKeys: 'shift+tab', description: 'Step in: focus the nearest thing that offers something' },
  'binnacle.focusNext': { defaultKeys: ['tab', 'down'], description: 'Focus the next thing that offers something' },
  'binnacle.focusPrevious': { defaultKeys: 'up', description: 'Focus the previous thing that offers something' },
  'binnacle.primary': { defaultKeys: 'enter', description: 'Do what the focused thing offers first' },
  'binnacle.stepOut': { defaultKeys: 'escape', description: 'Give the keyboard back to the composer' },
} as const satisfies KeybindingDefinitions

/** What the table resolves a key to: a key gesture's binding, or one of the host's own. */
export type ResolvedKey =
  | { readonly kind: 'gesture', readonly binding: KeyBinding }
  | { readonly kind: 'quit' }
  | { readonly kind: 'switch-screens' }

/** The one key table. */
export interface KeyTable {
  /** The manager holding every binding, for the host to install with pi-tui's `setKeybindings`. */
  readonly manager: KeybindingsManager
  /**
   * What a key resolves to.
   * @param data - the key's bytes, as the terminal reported them.
   * @param focused - whether something on screen has focus, which decides which bindings are live.
   * @returns what the key resolved to, or undefined when nothing binnacle binds answers it.
   */
  readonly resolve: (data: string, focused: boolean) => ResolvedKey | undefined
}

/**
 * Build the one key table.
 * @returns the table, holding a manager of its own.
 */
export function keyTable(): KeyTable {
  const manager = new KeybindingsManager(KEYBINDINGS)
  return {
    manager,
    resolve: (data: string, focused: boolean): ResolvedKey | undefined => {
      if (isKeyRelease(data) || isKeyRepeat(data)) return undefined
      if (manager.matches(data, 'binnacle.quit')) return { kind: 'quit' }
      if (manager.matches(data, 'binnacle.switchScreens')) return { kind: 'switch-screens' }
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
