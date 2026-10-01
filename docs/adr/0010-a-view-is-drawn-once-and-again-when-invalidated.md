# A view is drawn once, and again when its author invalidates it

Calling every view for every entry at every frame cost 120 ms a frame at 1,000 turns and 540 ms at 4,000, measured over a generated session. So a view is drawn once for each entry and its drawing kept, drawn again only when the entry changes, when its key's views change, or when its author calls `invalidate(key)` because something else it read has changed.

## Considered Options

- **Hand a view every input it may read, and redraw when any changes.** Nothing to forget. Rejected because binnacle would have to name in advance everything an author might read; the author knows what its view read.
- **Let an author invalidate the whole pane.** One call. Rejected because it redraws every entry, which at 4,000 turns costs what a frame cost before.

## Consequences

- A view that reads outside its entry and never calls `invalidate` shows what it read when it was drawn. That is the one way a view goes stale.
