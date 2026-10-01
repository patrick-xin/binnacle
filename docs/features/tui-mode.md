# TUI mode

A person reads the session on either of the terminal's screens, which pi calls TUI modes:

- **fullscreen**, the alternate screen. binnacle holds the window: the transcript scrolls in it above the composer, a click opens a fold, and a drag selects. Scrolled away from the end, that window's last row says so and names the key that jumps back.
- **regular**, the main screen. The session is printed into the terminal's own scrollback, so the person scrolls, searches and selects with the terminal they already know. No pointer reaches binnacle there; a key is the only way to reach what content offers ([Keys](keys.md)).

`--tui-mode regular` or `--tui-mode fullscreen` picks the screen at start, and Ctrl+T switches while it runs. A switch keeps what was drawn, what is typed in the composer, and where focus was ([Keys](keys.md)). Whichever screen a person quits from, the terminal is left holding the session, printed once.

## How it works

- At each switch, the host stops the live pi-tui screen and builds the other over the same terminal, moving the same pane and composer into it, as pi does (`pi:packages/coding-agent/src/modes/interactive/interactive-mode.ts`). It sets focus and adds the one key table's input listener on each screen it builds, and hands the composer a reference that reaches whichever screen is live. Where the main screen left off is kept for its next turn (`binnacle:packages/binnacle/src/host/index.ts#apply`). The fullscreen it builds carries pi-tui's jump-to-end indicator, drawn by pi-tui while the window is scrolled away from the end its scroll view follows (`pi:packages/tui/src/tui-alt-screen.ts`).
- The pane draws for the screen it is told (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`). On the main screen it prints an entry once it has settled (`binnacle:packages/binnacle/src/models/transcript.ts#settled`), and never changes a row it printed ([ADR 14](../adr/0014-on-the-main-screen-a-printed-row-never-changes.md)).
- Quitting from fullscreen switches to regular first, and stops there.

## Choices

- Both screens, switched while running, as pi offers them. The alternate screen alone gives up the terminal's own scrollback, search and selection, which pi keeps as its default. Choosing once at start carries nothing across a switch, and a fold in a printed entry can only be opened on the other screen, which a key reaches by switching ([Keys](keys.md)).
- fullscreen by default, where a click or a key reaches what content offers. pi's default is regular.
- Ctrl+T switches, and Ctrl+C pressed twice quits, answered by the host through the one key table, as placements keep them ([ADR 13](../adr/0013-placements-reach-the-whole-screen.md), [ADR 8](../adr/0008-a-key-means-something-only-through-one-key-table.md)).
- pi's words, `regular` and `fullscreen`.
- A switch moves the pane, not a new one. A new pane would draw every entry again, at a cost that grows with the session ([ADR 10](../adr/0010-a-view-is-drawn-once-and-again-when-invalidated.md)), and would lose what a person had opened.
- Quitting leaves the session printed on the main screen, as pi's fullscreen does by default.
- While the fullscreen is scrolled away from the end it follows, its last row carries ` ↓ Jump to latest · end ` in the accent tone, pi-tui's own indicator rather than one drawn for it. The key is named as the one key table binds pi-tui's `tui.altScreen.bottom` ([Keys](keys.md)), so a rebinding would be named too; pi-tui answers that key, or a click on the label, by returning to the end, and the label goes. While the window follows its end, there is no label.
