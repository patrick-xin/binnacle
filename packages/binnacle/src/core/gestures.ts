import { KeybindingsManager, TUI_KEYBINDINGS } from '../terminal/keybindings.ts'
import type { Keybinding, KeybindingDefinitions } from '../terminal/keybindings.ts'

// binnacle has no fullscreen viewport of pi's, and ctrl+c is the core's clear, so the editor's copy gives it up.
// Escape is also the core's interrupt. The composer has no popup yet; once it has one, it keeps escape while the popup is open, as pi does.
const EDITOR_KEYS: KeybindingDefinitions = {
  ...Object.fromEntries(Object.entries(TUI_KEYBINDINGS).filter(([id]) => !id.startsWith('tui.altScreen.'))),
  'tui.input.copy': { ...TUI_KEYBINDINGS['tui.input.copy'], defaultKeys: [] },
  'tui.select.cancel': { ...TUI_KEYBINDINGS['tui.select.cancel'], defaultKeys: 'escape' },
}

/** The Gesture Table of the editor's keys: the copied editor reads it through pi-tui's `getKeybindings`. The core's own gestures are actions. */
export const gestureTable = new KeybindingsManager(EDITOR_KEYS)

export function editorActionsOf(gesture: string): string[] {
  return Object.keys(EDITOR_KEYS).filter((action) => gestureTable.matches(gesture, action as Keybinding))
}
