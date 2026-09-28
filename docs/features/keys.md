# Keys

A person reaches what content offers from the keyboard, on either screen. On the main screen no pointer reaches binnacle, so there a key is the only way.

- **Step in.** From the composer, Shift+Tab focuses the nearest thing on screen that offers something: a fold cut short, or one opened.
- **Move.** While something has focus, Tab or ↓ moves focus to the next such thing and Shift+Tab or ↑ to the previous, in screen order, wrapping.
- **Open.** Enter does what the focused thing offers first: it opens a cut fold, or folds an open one again.
- **Step out.** Esc gives the keyboard back to the composer. So does any key Keys does not answer, and that key reaches the composer as typed, so typing is never lost.
- **A plugin's screen.** A placed screen opens on the key its plugin offers, in the transcript's place; from the main screen, opening switches to the fullscreen. The same key, or Esc, returns to the transcript as it was — its scroll, focus and folds — and, where opening switched, to the screen the person was on. While it is open, the screen answers the keys the transcript would, on itself: Shift+Tab steps in, and with something on it focused, Tab, ↓, ↑ and Enter move focus and open, with UI state of the screen's own. The fullscreen's own keys scroll, search and select it, the composer below stays live, and nothing moves on the transcript beneath; Ctrl+C and Ctrl+T still answer, and leaving the fullscreen closes it.
- **See focus.** A row in the accent tone says what Enter will do, in the focused thing's own words (`▸ show 12 more lines`, `▸ fold to 3 lines`). A cut fold's `… 12 more lines` row becomes that row, and a fold that is one line becomes it with its title kept on — `▸ ∴ thinking · show 12 more lines` — open or closed: the fold's own row replaced in its place, wrapping to more rows at a narrow width as any line does. An open fold that shows rows draws the row anew beneath what it holds. On the fullscreen, focus brings what it is on into view.
- **On the main screen**, focus that reaches an entry already printed switches to the fullscreen, with that entry in view and focused. Enter opens it in place there, and Ctrl+T back finds the main screen as it was. Focus on something not yet printed stays on the main screen, drawn there. Focus the main screen cannot draw, on an entry printed before a switch to it or as printing catches up, is set aside rather than a printed row changed, and the keyboard goes back to the composer. Ctrl+T back to the fullscreen gives it back, drawn and in view, unless a key was pressed in between: then it is forgotten, so Enter sends what was typed.
- Ctrl+C quits and Ctrl+T switches screens, as ever.

## How it works

One key table (`binnacle:packages/binnacle/src/ui/keys.ts#KEYBINDINGS`), held with pi-tui's own bindings in one manager and installed with pi-tui's `setKeybindings`, so the composer and the alternate screen read the same table. It answers a press only, once: a key held or let go, which a kitty-protocol terminal also reports, is answered by nothing binnacle binds ([ADR 13](../adr/0013-a-key-means-something-only-through-the-one-key-table.md)). A key the table resolves becomes a `key` gesture, and the gesture table gives it its meaning ([ADR 1](../adr/0001-content-offers-affordances-the-surface-owns-gestures.md)); what is bound to the host, quitting and switching screens, the host answers ([ADR 11](../adr/0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)). The key a plugin offers for a screen it placed is a binding in the same table, named for the screen (`binnacle.screen.<name>`); the manager is rebuilt with the offers as they come and go, carrying what a person rebound, so one table still answers every key. Whether something has focus decides which bindings are live, and that is decided in the table: with nothing focused, the composer keeps every key but Shift+Tab, Ctrl+C and Ctrl+T. Keys arrive ahead of the composer, through pi-tui's input listener. Focus is UI state (`binnacle:packages/binnacle/src/ui/state.ts#UiState`) held by the pane that answers for the screen being read — the transcript pane for the transcript, or the screen pane for a placed screen that is open — each answering key gestures on the screen it last drew and reporting what to bring into view, or a printed entry asking for the fullscreen (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`, `binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane`).

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

- Focus is drawn as a row in the accent tone, saying what Enter will do in the thing's own words: in place of the fold's own marker row or line — which can wrap to more at a narrow width, as any line does — or, on an open fold that shows rows, added beneath what it holds.
- Step in lands on the nearest thing that offers something — the last on screen, by the composer.
- Focus set aside by the main screen comes back with the fullscreen only if nothing was pressed in between, so a line typed there is never answered by focus.
- On the main screen, focus reaching a printed entry switches to the fullscreen rather than reprint the scrollback ([ADR 12](../adr/0012-on-the-main-screen-a-printed-row-never-changes.md)); bringing what is focused into view scrolls only when it is out of view.
- The key a plugin offers for a screen it placed is the plugin's to choose, in the same table and so the same to rebind once rebinding lands; `--help` names binnacle's own keys, not the ones a profile's plugins offer, which are known only once its rows have loaded.

## Open

- [#5](https://github.com/patrick-xin/binnacle/issues/5): a person cannot rebind a key.
- [#6](https://github.com/patrick-xin/binnacle/issues/6): no key reaches an affordance but the primary one.
