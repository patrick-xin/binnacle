# 12. On the main screen, a printed row never changes

- Status: accepted
- Date: 2026-09-26

## Context

binnacle can draw on the terminal's main screen, pi-tui's regular mode, where the terminal's scrollback holds the history. There, pi-tui compares every line with the last frame and rewrites what changed. It can reach only the rows in the window. A change to a row that has scrolled above it makes pi-tui clear the screen and the scrollback, then print the whole session again (pi-tui's `TuiMainScreen`, at v0.87.1).

binnacle changes rows after drawing them:
- a call's result replaces `running…`;
- a turn ends;
- a fold opens;
- a view is registered, disposed or invalidated ([ADR 9](0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)).

On the alternate screen, each change costs a window's worth of rows. On the main screen, once the row has scrolled away, each one wipes the scrollback a person may be reading and prints the session again. That happens every time a result lands for a call they have scrolled past, and it grows with the session.

codex never changes what it has written to the scrollback. A cell is written above the window once it is finished, and the one still in flight changes in place below it. Its full-screen transcript, on Ctrl+T, shows both (codex's chat widget and its history insertion, at commit d7b07d4).

## Decision

**On the main screen, binnacle never changes a row it has printed. It prints an entry, in log order, once nothing later in the log can change it. What can still change is drawn below what it printed, above the composer.**

- A call is printed with its result, once the result arrives or its turn ends. Until then, the call and everything after it are drawn below. A call has one drawing, whichever screen it is on.
- A turn's ending is drawn after the turn's entries, never inside one of them.
- A change to an entry after it is printed shows on the alternate screen. On the main screen it shows only in what is still to be printed. Such a change is a view registered, disposed or invalidated, or a fold opened on the other screen.
- When the terminal is resized, pi-tui prints the session again, and binnacle lays out what it printed again, as it now draws it. The same happens when the log is read again or pi-tui invalidates the pane: each is rare, and each is a change to everything printed.

## Alternatives considered

**Change the row, and let pi-tui print the session again.** This is pi's regular mode, and there is nothing to build. It lost on its cost, which is paid at every result and grows with the session, and because clearing the scrollback strands the person reading it.

**Draw every change as a new row.** A result would be printed as an entry of its own below, never inside its call's card, and nothing would be held back. It lost for two reasons:
- a finished call would read `running…` in the scrollback forever;
- a view would draw a call one way on each screen, so an author's view would have two contracts.

**Hold back each turn until it ends.** The rule is simpler. It lost because a turn can be taller than the window: its top would scroll away while it can still change, which brings back the reprint.

## Consequences

- What is drawn below the printed rows is small: the calls still running, and what came after them. It outgrows the window only when a step runs more calls than the window has rows. A change to its top then prints the session again, as pi-tui would.
- An author's view that is drawn again after its entry is printed changes the alternate screen, not the scrollback. On the main screen, a view on a timer ticks only until its entry is printed.
- A call whose turn ended without a result is printed as it then draws.
- A resize prints the session again, which is pi-tui's own behaviour on the main screen.
- A fold in a printed entry cannot open in place on the main screen.
