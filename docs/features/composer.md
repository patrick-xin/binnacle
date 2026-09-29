# Composer

Below the transcript, a person types and presses Enter to submit the line. The composer takes typing while the agent works as while it waits: the line steers a running turn, reaching it at its next step, rather than waiting for the turn to end. What a submitted line does is the composer placement's to decide, and out of the box the built-in Composer plugin sends each line that is not blank to the agent. What was sent appears in the transcript once the session logs it, a line that steered a running turn drawn as one ([Transcript](transcript.md)).

The composer is not fixed chrome: it is placed in the composer's slot through the same registration an author uses, and lines may be placed above and below it — out of the box one is, the [Status line](status-line.md) beneath.

## How it works

The composer is pi-tui's `Editor`, drawn in the composer's theme (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`); its editing keys are pi-tui's own (`pi:packages/tui/src/keybindings.ts#TUI_KEYBINDINGS`). A submitted line is the composer placement's to act on: the host clears the composer and hands the submitted line to the placement's `submit` (`binnacle:packages/binnacle/src/api.ts#Placement`) as pi-tui's `Editor` hands it on — trimmed of the whitespace around it, a blank line included (`pi:packages/tui/src/components/editor.ts#submitValue`) — so a plugin decides what a submitted line does ([Authoring](authoring.md)). The built-in Composer plugin sends a line that is not blank through `ctx.binnacle.send`, a grant the host performs on the open session (`binnacle:packages/binnacle/src/host/session.ts#OpenedSession`), which throws before the session opens or after it closes, saying so.

The composer is placed in its slot by the built-in Composer plugin (`binnacle:packages/binnacle/src/plugins/composer/index.ts#composer`), holding only what an author holds: the newest placement in the slot draws, so an author's plugin can place lines there instead, and with no composer placed nothing takes typing — a read-only viewer — while what the host answers itself, quitting included, still answers ([Authoring](authoring.md)).

## Choices

- pi-tui's `Editor` is taken as upstream ships it, not rebuilt.
- A submitted line reaches the placement trimmed of the whitespace around it, a blank line included: the `Editor` trims a line before it submits it, and is taken as upstream ships it; the composer clears itself either way. That a blank line is not sent is the built-in plugin's choice, a person's to change by asking for a composer that does something else with one.
- A sent line is drawn from the session log, never echoed from the composer, so the transcript has one source.
- Taking the composer away leaves a read-only viewer: nothing takes typing, and the session is still read and quit.
