# 9. A view is drawn once for each entry, and again when its author invalidates it

- Status: accepted
- Date: 2026-09-26

## Context

pi-tui draws a frame on every keystroke, and binnacle hands it the whole transcript ([ADR 7](0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)). Calling every view for every entry at every frame cost 120 ms a frame at 1,000 turns and 540 ms at 4,000, read by timing the screen over a generated session. So a view must be drawn once and its drawing kept.

Keeping a drawing makes a view a function of its entry alone. A view that reads anything else, such as a setting a person toggles, the time, or state its plugin keeps, is never drawn again when that changes. [ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md) wants such views: a person asks for compact tool cards behind a key, or a running call that counts its seconds.

pi meets the same tension in its components: they cache by width and content, and an extension that changes what one reads calls `invalidate()`, then asks for a render (`pi:packages/coding-agent/docs/tui.md`).

## Decision

**A view is drawn once for each entry, and the drawing is kept. It is drawn again only when:**

- the entry changes, as when a call's result arrives;
- the views of its key change: one is registered or disposed, or an author calls `invalidate(key)`;
- pi-tui invalidates the pane.

A kept drawing is laid out again at a new width, or when a fold in it opens or closes.

A view that reads anything besides its entry calls `invalidate(key)` when what it read changes. Only that key's entries are drawn again, and the log is not read again.

## Alternatives considered

**Call every view at every frame.** Every view is always current, whatever it reads. It lost on the frame cost above, which grows with the session.

**Hand a view every input it may read, and draw it again when any of them changes.** Nothing to forget. It lost because binnacle would have to name in advance everything an author might read, where ADR 0 leaves that open; the author knows what its view read. An input binnacle owns can still arrive this way: the theme already does, since changing it invalidates the pane.

**Let an author invalidate the whole pane.** One call, nothing to key. It lost because it draws every entry again, which at 4,000 turns costs about what a frame cost before, for a change to one kind.

## Consequences

- A frame costs what changed. The first frame and a resize still lay every entry out.
- A view that reads outside its entry and never calls `invalidate` shows what it read when it was drawn. That is the one way a view goes stale, and the view's contract says so.
- A view driven by time calls `invalidate` on a timer its plugin keeps, and each tick draws its key's entries again.
