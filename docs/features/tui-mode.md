# TUI mode

A person reads the session on either of the terminal's screens, which pi calls TUI modes:

- **fullscreen**, the alternate screen. binnacle holds the window: the transcript scrolls in it above the composer, a click opens a fold, and a drag selects.
- **regular**, the main screen. The session is printed into the terminal's own scrollback, so the person scrolls, searches and selects with the terminal they already know. No click reaches binnacle there.

`--tui-mode regular` or `--tui-mode fullscreen` picks the screen at start, and Ctrl+T switches while it runs. A switch keeps what was drawn, and what is typed in the composer. Whichever screen a person quits from, the terminal is left holding the session, printed once.

## How it works

- At each switch, the host stops the live pi-tui screen and builds the other over the same terminal, moving the same pane and composer into it, as pi does (`pi:packages/coding-agent/src/modes/interactive/interactive-mode.ts`). It sets focus and the keys it answers on each screen it builds, and hands the composer a reference that reaches whichever screen is live. Where the main screen left off is kept for its next turn (`binnacle:packages/binnacle/src/host/index.ts#apply`).
- The pane draws for the screen it is told (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`). On the main screen it prints an entry once it has settled (`binnacle:packages/binnacle/src/models/transcript.ts#settled`), and never changes a row it printed ([ADR 12](../adr/0012-on-the-main-screen-a-printed-row-never-changes.md)).
- Quitting from fullscreen switches to regular first, and stops there.

## Choices

- Both screens, switched while running, as pi offers them. The alternate screen alone gives up the terminal's own scrollback, search and selection, which pi keeps as its default. Choosing once at start carries nothing across a switch, but a fold in a printed entry can only be opened on the other screen.
- fullscreen by default, where a click reaches what content offers. pi's default is regular.
- Ctrl+T switches, answered by the host, like quitting ([ADR 11](../adr/0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)).
- pi's words, `regular` and `fullscreen`.
- A switch moves the pane, not a new one. A new pane would draw every entry again, at a cost that grows with the session ([ADR 9](../adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)), and would lose what a person had opened.
- Quitting leaves the session printed on the main screen, as pi's fullscreen does by default.

## Open

- [#1](https://github.com/patrick-xin/binnacle/issues/1): the host matches Ctrl+T itself, not through a key table.
- [#2](https://github.com/patrick-xin/binnacle/issues/2): opening a fold in a printed entry from the main screen.
