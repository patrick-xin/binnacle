# Keys

A person reaches what content offers from the keyboard, on either screen. On the main screen no pointer reaches binnacle, so there a key is the only way.

- **Step in.** From the composer, Shift+Tab focuses the nearest thing on screen that offers something: a fold cut short, or one opened.
- **Move.** While something has focus, Tab or ↓ moves focus to the next such thing and Shift+Tab or ↑ to the previous, in screen order, wrapping.
- **Open.** Enter does what the focused thing offers first: it opens a cut fold, or folds an open one again.
- **Step out.** Esc gives the keyboard back to the composer. So does any key Keys does not answer, and that key reaches the composer as typed, so typing is never lost.
- **See focus.** A row in the accent tone is drawn under the focused thing: `▸` and what Enter will do, in its affordance's label (`▸ show 12 more lines`, `▸ fold to 3 lines`). A cut fold's `… 12 more lines` row becomes that row, so focusing it moves nothing. On the fullscreen, focus brings what it is on into view.
- **On the main screen**, focus that reaches an entry already printed switches to the fullscreen, with that entry in view and focused. Enter opens it in place there, and Ctrl+T back finds the main screen as it was. Focus on something not yet printed stays on the main screen, drawn there; when printing catches up to it, focus is dropped rather than a printed row changed. Switching to the main screen drops focus that sits on a printed entry.
- Ctrl+C quits and Ctrl+T switches screens, as ever.

## How it works

One key table (`binnacle:packages/binnacle/src/ui/keys.ts#KEYBINDINGS`), held with pi-tui's own bindings in one manager and installed with pi-tui's `setKeybindings`, so the composer and the alternate screen read the same table. It answers a press only, once: a key held or let go, which a kitty-protocol terminal also reports, is answered by nothing binnacle binds ([ADR 13](../adr/0013-a-key-means-something-only-through-the-one-key-table.md)). A key the table resolves becomes a `key` gesture, and the gesture table gives it its meaning ([ADR 1](../adr/0001-content-offers-affordances-the-surface-owns-gestures.md)); what is bound to the host, quitting and switching screens, the host answers ([ADR 11](../adr/0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)). Whether something has focus decides which bindings are live, and that is decided in the table: with nothing focused, the composer keeps every key but Shift+Tab, Ctrl+C and Ctrl+T. Keys arrive ahead of the composer, through pi-tui's input listener. Focus is UI state (`binnacle:packages/binnacle/src/ui/state.ts#UiState`) held by the transcript pane, which answers key gestures on the screen it last drew and reports what to bring into view, or a printed entry asking for the fullscreen (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`).

## Choices

- The default keys, each named with what it does in `--help`, a person's to change:

| Binding | Keys |
| --- | --- |
| step in, or previous | `shift+tab`; also `up` while focused |
| next, while focused | `tab`, `down` |
| primary, while focused | `enter` |
| step out, while focused | `escape` |
| quit | `ctrl+c` |
| switch screens | `ctrl+t` |

- Focus is drawn as one row in the accent tone under the focused thing, saying what Enter will do in the thing's own words, so nothing moves when a cut fold takes focus.
- Step in lands on the nearest thing that offers something — the last on screen, by the composer.
- On the main screen, focus reaching a printed entry switches to the fullscreen rather than reprint the scrollback ([ADR 12](../adr/0012-on-the-main-screen-a-printed-row-never-changes.md)); bringing what is focused into view scrolls only when it is out of view.

## Open

- [#5](https://github.com/patrick-xin/binnacle/issues/5): a person cannot rebind a key.
- [#6](https://github.com/patrick-xin/binnacle/issues/6): no key reaches an affordance but the primary one.
