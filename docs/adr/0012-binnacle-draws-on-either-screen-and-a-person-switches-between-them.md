# 12. binnacle draws on either screen, and a person switches between them

- Status: accepted; settles what [ADR 7](0007-pi-tui-windows-scrolls-and-selects-the-transcript.md) left open
- Date: 2026-09-26

## Context

pi-tui draws on either of the terminal's screens, and the two give a person different things (`pi:packages/tui/README.md`):
- On the alternate screen (`TuiAltScreen`), pi-tui owns the window. It scrolls the transcript, selects on a drag, and hands binnacle the pointer.
- On the main screen (`TuiMainScreen`), the terminal's own scrollback holds the history. A person scrolls, searches and selects with the terminal they already know. pi-tui turns on no pointer, so no click reaches binnacle.

[ADR 7](0007-pi-tui-windows-scrolls-and-selects-the-transcript.md) decided nothing between them, and binnacle drew on the alternate screen alone.

pi offers both. It calls them `regular` and `fullscreen`, and a person picks one with `--tui-mode` or from its settings while it runs. Its switch stops one pi-tui object, builds the other over the same terminal, and moves the same components into it, taking back the main screen's render state where it left off (`pi:packages/coding-agent/src/modes/interactive/interactive-mode.ts`).

Whatever the old object held is lost unless the switch carries it over:
- the keys it answered, Ctrl+C included;
- which component had focus;
- the pi-tui object a component was built with, as the composer is.

## Decision

**binnacle draws on either screen, and which one is the person's choice, when it starts and while it runs. A switch changes only the screen.** These carry over:
- the pane and what it drew;
- the composer and what is typed in it;
- focus;
- every key the host answers.

- The words are pi's: `regular` for the main screen, `fullscreen` for the alternate one.
- The switch is the host's, like quitting ([ADR 11](0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)), since it is about the terminal the host holds.
- Whichever screen a person quits from, the terminal keeps the session, printed once. Quitting from fullscreen switches to regular first and stops there, as pi does.

## Alternatives considered

**The alternate screen alone**, as built. There is nothing to build, and the pointer always works. It lost because a person gives up their terminal's own scrollback, search and selection, which pi keeps as its default.

**Choose once, at start.** Nothing crosses from one pi-tui object to another, so nothing can be forgotten on the way. It lost because opening a fold that the main screen has already printed needs a visit to the other screen ([ADR 13](0013-on-the-main-screen-a-printed-row-never-changes.md)). pi also switches while running.

**Build a new pane and composer at each switch.** Every pi-tui object would be fresh, with no references to carry. It lost on two counts:
- every entry would be drawn again, at a cost that grows with the session ([ADR 9](0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md));
- what a person had typed, and what they had opened, would be gone.

## Consequences

- The host holds which pi-tui object is live. A component built with one is handed a reference that reaches whichever is live, as pi's are.
- Every key the host answers is added to each pi-tui object it builds, and a test switches screens and then quits with Ctrl+C.
- A switch draws no entry again.
- The pointer exists only on fullscreen. On regular, a key is the only way to reach what content offers, which is why Keys comes next.
