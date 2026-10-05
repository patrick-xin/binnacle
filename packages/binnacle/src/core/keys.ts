import { KeybindingsManager, TUI_KEYBINDINGS } from '../terminal/keybindings.ts'
import type { Keybinding, KeybindingDefinitions } from '../terminal/keybindings.ts'

declare module '../terminal/keybindings.ts' {
  interface Keybindings {
    'binnacle.clear': true
    'binnacle.interrupt': true
    'binnacle.suspend': true
  }
}

const CORE_KEYS = {
  'binnacle.clear': { defaultKeys: 'ctrl+c', description: 'Clear the draft; pressed twice on an empty draft, quit binnacle' },
  'binnacle.interrupt': { defaultKeys: 'escape', description: 'Interrupt the turn that runs' },
  'binnacle.suspend': { defaultKeys: 'ctrl+z', description: 'Suspend binnacle, back to the shell' },
} as const satisfies KeybindingDefinitions

export type CoreAction = keyof typeof CORE_KEYS

// binnacle has no fullscreen viewport of pi's, and ctrl+c is the core's, so the editor's copy and cancel give it up.
const EDITOR_KEYS: KeybindingDefinitions = {
  ...Object.fromEntries(Object.entries(TUI_KEYBINDINGS).filter(([id]) => !id.startsWith('tui.altScreen.'))),
  'tui.input.copy': { ...TUI_KEYBINDINGS['tui.input.copy'], defaultKeys: [] },
  'tui.select.cancel': { ...TUI_KEYBINDINGS['tui.select.cancel'], defaultKeys: 'escape' },
}

const ACTIONS = { ...EDITOR_KEYS, ...CORE_KEYS }

/** The one Key Table: the copied editor reads it through pi-tui's `getKeybindings`. */
export const keyTable = new KeybindingsManager(ACTIONS)

export function actionsOf(key: string): string[] {
  return Object.keys(ACTIONS).filter((action) => keyTable.matches(key, action as Keybinding))
}

export function coreActionOf(key: string): CoreAction | undefined {
  return (Object.keys(CORE_KEYS) as CoreAction[]).find((action) => keyTable.matches(key, action))
}
