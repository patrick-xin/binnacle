import { KeybindingsManager, TUI_KEYBINDINGS } from '../terminal/keybindings.ts'
import type { Keybinding, KeybindingDefinitions } from '../terminal/keybindings.ts'

declare module '../terminal/keybindings.ts' {
  interface Keybindings {
    'binnacle.clear': true
    'binnacle.interrupt': true
    'binnacle.suspend': true
    'binnacle.focus.next': true
    'binnacle.scroll.up': true
    'binnacle.scroll.down': true
  }
}

// Escape is also the editor's select.cancel. The composer has no popup yet; once it has one, it keeps escape while the popup is open, as pi does.
const CORE_GESTURES = {
  'binnacle.clear': { defaultKeys: 'ctrl+c', description: 'Clear the draft; pressed twice on an empty draft, quit binnacle' },
  'binnacle.interrupt': { defaultKeys: 'escape', description: 'Interrupt the turn that runs' },
  'binnacle.suspend': { defaultKeys: 'ctrl+z', description: 'Suspend binnacle, back to the shell' },
  'binnacle.focus.next': { defaultKeys: 'shift+tab', description: 'Move the Focus to the next Place whose Part takes keys' },
  'binnacle.scroll.up': { defaultKeys: 'wheelup', description: 'Scroll the Place under the pointer up' },
  'binnacle.scroll.down': { defaultKeys: 'wheeldown', description: 'Scroll the Place under the pointer down' },
} as const satisfies KeybindingDefinitions

export type CoreAction = keyof typeof CORE_GESTURES

// binnacle has no fullscreen viewport of pi's, and ctrl+c is the core's, so the editor's copy and cancel give it up.
const EDITOR_KEYS: KeybindingDefinitions = {
  ...Object.fromEntries(Object.entries(TUI_KEYBINDINGS).filter(([id]) => !id.startsWith('tui.altScreen.'))),
  'tui.input.copy': { ...TUI_KEYBINDINGS['tui.input.copy'], defaultKeys: [] },
  'tui.select.cancel': { ...TUI_KEYBINDINGS['tui.select.cancel'], defaultKeys: 'escape' },
}

const ACTIONS = { ...EDITOR_KEYS, ...CORE_GESTURES }

/** The one Gesture Table: the copied editor reads it through pi-tui's `getKeybindings`. */
export const gestureTable = new KeybindingsManager(ACTIONS)

export function actionsOf(gesture: string): string[] {
  return Object.keys(ACTIONS).filter((action) => gestureTable.matches(gesture, action as Keybinding))
}

export function coreActionOf(gesture: string): CoreAction | undefined {
  return (Object.keys(CORE_GESTURES) as CoreAction[]).find((action) => gestureTable.matches(gesture, action))
}
