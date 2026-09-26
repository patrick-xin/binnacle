# 6. A pane joins views to pi-tui, and the host keeps only what is impure

- Status: accepted; extends [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)
- Date: 2026-09-26

## Context

[ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md) gives views data, never a pi-tui component, and gives the host the terminal and the harness runtime. Between them sits code neither holds: a pi-tui component that draws views at the width pi-tui gives it, keeps UI state, and answers input through the gesture table. The transcript is the first; an approval, a picker, a form and a side panel follow it.

Only the host may import both views and pi-tui, so each lands there. The lint that keeps the clock, randomness and the process out of the layers below does not reach the host, and "the only impure layer" stops meaning anything once the host also holds deterministic components.

## Decision

**A pane is a pi-tui component that draws views. Panes live in `src/panes/`, between views and the host.**

- A pane may import the layers below it and pi-tui; [`layers.json`](../../packages/binnacle/layers.json) states which, and `check:layers` holds it.
- A pane is deterministic: what it draws follows from what it was given — facts, registrations and a width — and from the UI state it holds. It reports what it cannot do itself through callbacks it was given, and it reads no clock, randomness, environment or process; the lint that holds the layers below holds it too.
- A component that draws no view belongs in `ui`, not here.
- The host keeps the terminal, the harness runtime and the process: it builds panes, places them on the screen, and wires them to the session.

## Alternatives considered

**Keep panes in the host, and list the files the lint should hold.** No new layer. It lost because a list of files is a rule that rots, and the host would hold two kinds of code a reader has to tell apart file by file.

**Let views return pi-tui components**, so a view draws and answers on its own. It lost because ADR 2 gives views data so that a plugin is bound to no render base; a view holding a component is one a pi-tui change breaks.

**Put panes in `ui`, and let `ui` import views.** One layer fewer. It lost because views draw with the ui's nodes, so the ui importing views is a cycle.

## Consequences

- The host shrinks to wiring, and a pane is tested as the screen is: facts in, lines out, no terminal.
- A pane is deterministic, not pure: it holds UI state and calls back when what it draws has changed.
