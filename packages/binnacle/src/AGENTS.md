# src

binnacle's source: layers, each importing only what [`layers.json`](../layers.json) lets it, the author API over them, and the entry the bundle loads. The harness, the session and its log are dsh's; drawing, the terminal's screens and scrolling are pi-tui's; plugins and their lifecycle are Cordis'.

- `contract/` — what otherwise-independent layers share: affordances, regions, gestures and actions.
- `facts/` — one dsh session event as one fact.
- `models/` — facts folded into the transcript's turns.
- `ui/` — nodes and their layout, the theme, the key and gesture tables, and UI state.
- `views/` — how each transcript entry, and the whole screen, is drawn.
- `panes/` — the pi-tui components that hold UI state and answer a person: the transcript and what plugins placed.
- `api.ts` — the author API: what an author, or a built-in feature, may depend on — the `binnacle` service and the types its registrations take and return.
- `plugins/` — binnacle's built-in features, each a plugin holding only what an author holds.
- `host/` — the one layer that touches the terminal and the process: the Cordis row, the session and the `binnacle` service.
- `index.ts` — binnacle's entry: the Cordis row the bundle patch inserts, and the author API's types.

## Keep

- Removing or renaming an export of `api.ts` breaks every author; its commit says so.
