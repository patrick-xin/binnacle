# binnacle draws with pi-tui, and takes what it ships

binnacle draws with pi-tui, and takes whatever pi-tui already does — laying out and measuring text, the key table, markdown, and the transcript's windowing, scrolling and selection — rather than building it again. So binnacle's UI state holds what a person opened and what has focus, never where they scrolled or what they selected. pi-tui's components stay inside binnacle's layers and never reach a plugin, which draws with blocks binnacle lays out ([ADR 11](0011-a-view-draws-with-blocks-in-the-themes-tones.md)).

## Considered Options

- **Window and scroll the transcript in binnacle**, keeping a scroll offset in UI state. binnacle's first screen harness did this. Rejected because it built again what pi-tui already does — following the end, the wheel, selection — and every such copy drifts from the library underneath it.

## Consequences

- A pi-tui release can change scrolling, selection or a key's meaning without a line changing in binnacle, so a release is read before its pin moves.
- A frame's cost grows with the whole transcript, not with what is visible, which is why drawing is kept per entry ([ADR 10](0010-a-view-is-drawn-once-and-again-when-invalidated.md)).
- The transcript's wheel belongs to pi-tui, so the gesture table's wheel rule reaches only what binnacle windows itself ([ADR 7](0007-content-offers-affordances-the-surface-owns-gestures.md)).
