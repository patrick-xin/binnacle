import { isKeyRepeat, isKeyRelease, KeybindingsManager, TUI_KEYBINDINGS } from '@earendil-works/pi-tui'
import type { KeyId, Keybinding, KeybindingDefinition, KeybindingDefinitions, KeybindingsConfig } from '@earendil-works/pi-tui'
import { affordances } from '../contract/index.ts'
import type { AffordanceKind, KeyBinding } from '../contract/index.ts'

export type { KeyId } from '@earendil-works/pi-tui'

type AffordanceKeybindings = { readonly [Kind in AffordanceKind as `binnacle.${Kind}`]: true }

export interface BinnacleKeybindings extends AffordanceKeybindings {
  'binnacle.quit': true
  'binnacle.switchScreens': true
  'binnacle.interrupt': true
  'binnacle.stepIn': true
  'binnacle.focusNext': true
  'binnacle.focusPrevious': true
  'binnacle.primary': true
  'binnacle.stepOut': true
}

declare module '@earendil-works/pi-tui' {
  interface Keybindings extends BinnacleKeybindings {}
}

export const BINNACLE_BINDINGS = {
  'binnacle.stepIn': { defaultKeys: 'shift+tab', description: 'step in: focus the nearest thing that offers something' },
  'binnacle.focusNext': { defaultKeys: ['tab', 'down'], description: 'focus the next thing that offers something' },
  'binnacle.focusPrevious': { defaultKeys: 'up', description: 'focus the previous thing that offers something' },
  'binnacle.primary': { defaultKeys: 'enter', description: 'do what the focused thing offers first' },
  'binnacle.stepOut': { defaultKeys: 'escape', description: 'give the keyboard back to the composer' },
  'binnacle.quit': { defaultKeys: 'ctrl+c', description: 'stop a running turn; pressed twice, quit' },
  'binnacle.switchScreens': { defaultKeys: 'ctrl+t', description: 'switch screens' },
  'binnacle.interrupt': { defaultKeys: 'escape', description: 'interrupt the running turn, while nothing has focus' },
} as const satisfies KeybindingDefinitions

export const AFFORDANCE_BINDINGS: { readonly [Kind in AffordanceKind as `binnacle.${Kind}`]: KeybindingDefinition } = {
  'binnacle.expand': { defaultKeys: [], description: 'open or fold the focused thing' },
  'binnacle.choose': { defaultKeys: [], description: 'choose the focused option' },
  'binnacle.open': { defaultKeys: [], description: 'open the focused thing where it leads' },
  'binnacle.copy': { defaultKeys: [], description: 'copy the focused thing' },
  'binnacle.answer': { defaultKeys: [], description: 'answer the focused question' },
  'binnacle.grant': { defaultKeys: [], description: 'grant what the focused thing asks' },
  'binnacle.dismiss': { defaultKeys: [], description: 'dismiss the focused thing' },
}

export const KEYBINDINGS = {
  ...TUI_KEYBINDINGS,
  ...BINNACLE_BINDINGS,
  ...AFFORDANCE_BINDINGS,
} as const satisfies KeybindingDefinitions

export type ResolvedKey =
  | { readonly kind: 'gesture'; readonly binding: KeyBinding }
  | { readonly kind: 'quit' }
  | { readonly kind: 'switch-screens' }
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'screen'; readonly name: string }
  | { readonly kind: 'screen-close' }

const bindingIds: Readonly<Partial<Record<KeyBinding, Keybinding>>> = {
  'focus.next': 'binnacle.focusNext',
  'focus.previous': 'binnacle.focusPrevious',
  'focus.out': 'binnacle.stepOut',
  primary: 'binnacle.primary',
}

const offeredBinding = (name: string): string => `binnacle.screen.${name}`

export interface KeyTable {
  readonly manager: KeybindingsManager
  readonly resolve: (data: string, focused: boolean, open?: boolean) => ResolvedKey | undefined
  readonly keysOf: (binding: KeyBinding) => readonly KeyId[]
  readonly offer: (name: string, definition: KeybindingDefinition) => () => void
  readonly bind: (bindings: KeybindingsConfig) => void
}

export function keyTable(): KeyTable {
  const offered = new Map<string, KeybindingDefinition>()
  let manager = new KeybindingsManager(KEYBINDINGS)
  let set: KeybindingsConfig = {}
  const rebuild = (bindings: KeybindingsConfig = manager.getUserBindings()): void => {
    manager = new KeybindingsManager({ ...KEYBINDINGS, ...Object.fromEntries(offered) }, bindings)
    set = manager.getUserBindings()
  }
  return {
    get manager(): KeybindingsManager {
      return manager
    },
    bind: (bindings: KeybindingsConfig): void => {
      rebuild(bindings)
    },
    offer: (name: string, definition: KeybindingDefinition): (() => void) => {
      const id = offeredBinding(name)
      offered.set(id, definition)
      rebuild()
      return () => {
        offered.delete(id)
        rebuild()
      }
    },
    keysOf: (binding: KeyBinding): readonly KeyId[] => manager.getKeys(bindingIds[binding] ?? (`binnacle.${binding}` as Keybinding)),
    resolve: (data: string, focused: boolean, open = false): ResolvedKey | undefined => {
      if (isKeyRelease(data) || isKeyRepeat(data)) return undefined
      // Bindings are checked in order: quit and screen switching, then screen keys if open,
      // step in, then focus moves/primary/step-out if focused, then affordances, else interrupt.
      const live: { readonly id: Keybinding; readonly to: ResolvedKey }[] = [
        { id: 'binnacle.quit', to: { kind: 'quit' } },
        { id: 'binnacle.switchScreens', to: { kind: 'switch-screens' } },
      ]
      for (const id of offered.keys())
        live.push({ id: id as Keybinding, to: { kind: 'screen', name: id.slice(offeredBinding('').length) } })
      if (open) live.push({ id: 'binnacle.stepOut', to: { kind: 'screen-close' } })
      live.push({ id: 'binnacle.stepIn', to: { kind: 'gesture', binding: 'focus.previous' } })
      if (focused) {
        live.push(
          { id: 'binnacle.focusNext', to: { kind: 'gesture', binding: 'focus.next' } },
          { id: 'binnacle.focusPrevious', to: { kind: 'gesture', binding: 'focus.previous' } },
          { id: 'binnacle.primary', to: { kind: 'gesture', binding: 'primary' } },
          { id: 'binnacle.stepOut', to: { kind: 'gesture', binding: 'focus.out' } },
        )
        for (const kind of Object.keys(affordances) as AffordanceKind[])
          live.push({ id: `binnacle.${kind}` as Keybinding, to: { kind: 'gesture', binding: kind } })
      } else live.push({ id: 'binnacle.interrupt', to: { kind: 'interrupt' } })
      // Explicit bindings take precedence over defaults.
      const explicit = live.filter(({ id }) => Object.hasOwn(set, id) && set[id] !== undefined)
      return (explicit.find(({ id }) => manager.matches(data, id)) ?? live.find(({ id }) => manager.matches(data, id)))?.to
    },
  }
}

export function refusedBindings(bindings: KeybindingsConfig): string | undefined {
  const screens: Record<string, KeybindingDefinition> = {}
  for (const [id, keys] of Object.entries(bindings)) {
    if (id.startsWith(offeredBinding(''))) screens[id] = { defaultKeys: [] }
    else if (!Object.hasOwn(KEYBINDINGS, id))
      return `${id} is no binding; bind one pi-tui or binnacle has, a placed screen's ${offeredBinding('<name>')}, or an affordance's binnacle.<kind>`
    const named = Array.isArray(keys) ? keys : [keys]
    if (named.some((key) => typeof key !== 'string'))
      return `${id} is bound to ${String(keys)}; bind it to a key as pi-tui names one, such as ctrl+q, or a list of them`
  }
  const conflict = new KeybindingsManager({ ...KEYBINDINGS, ...screens }, bindings).getConflicts()[0]
  if (conflict === undefined) return undefined
  return `${conflict.key} is bound to both ${conflict.keybindings.join(' and ')}; bind one of them to another key`
}
