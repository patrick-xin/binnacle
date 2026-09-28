# Composer

Below the transcript, a person types and presses Enter to send the line to the agent. A blank line is not sent. What was sent appears in the transcript once the session logs it.

The composer is not fixed chrome: it is placed in the composer's slot through the same registration an author uses, and lines may be placed above and below it — out of the box one is, the [Status line](status-line.md) beneath.

## How it works

The composer is pi-tui's `Editor`, drawn in the composer's theme (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`); its editing keys are pi-tui's own (`pi:packages/tui/src/keybindings.ts#TUI_KEYBINDINGS`). The host sends what it submits through the open session (`binnacle:packages/binnacle/src/host/session.ts#OpenedSession`) and clears it.

The composer is placed in its slot by the built-in Composer plugin (`binnacle:packages/binnacle/src/plugins/composer/index.ts#composer`), holding only what an author holds: the newest placement in the slot draws, so an author's plugin can place lines there instead, and with no composer placed nothing takes typing — a read-only viewer — while what the host answers itself, quitting included, still answers ([Authoring](authoring.md)).

## Choices

- pi-tui's `Editor` is taken as upstream ships it, not rebuilt.
- A sent line is drawn from the session log, never echoed from the composer, so the transcript has one source.
- Taking the composer away leaves a read-only viewer: nothing takes typing, and the session is still read and quit.
