# plugins/trajectory

The Trajectory: every event of a session, on a screen of its own. It holds the `binnacle` service to place its screen; reading dsh's events into facts is the facts layer's.

- `draw.ts` — the drawing: one line per event, its kind and a few words, its record folded on that line, grouped by turn.
- `index.ts` — the plugin: places the screen and the key that opens it.
