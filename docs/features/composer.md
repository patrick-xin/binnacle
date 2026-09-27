# Composer

Below the transcript, a person types and presses Enter to send the line to the agent. A blank line is not sent. What was sent appears in the transcript once the session logs it.

## How it works

The composer is pi-tui's `Editor`, drawn in the composer's theme (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`); its editing keys are pi-tui's own (`pi:packages/tui/src/keybindings.ts#TUI_KEYBINDINGS`). The host sends what it submits through the open session (`binnacle:packages/binnacle/src/host/session.ts#OpenedSession`) and clears it.

## Choices

- pi-tui's `Editor` is taken as upstream ships it, not rebuilt.
- A sent line is drawn from the session log, never echoed from the composer, so the transcript has one source.
