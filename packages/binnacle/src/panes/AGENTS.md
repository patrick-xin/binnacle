# panes

The pi-tui components the host mounts: the transcript, and what a plugin placed. A pane holds UI state and answers a person's pointer and keys through `ui`'s gesture table; what is drawn is `views`', and mounting, scrolling and the terminal are the host's and pi-tui's.

- `placed.ts` — the fence every drawing a plugin places is called through, and how what went wrong is drawn.
- `screen.ts` — the screen pane: a placed screen in the transcript's place, or placed lines around or in the composer's seat, drawn in the room its place gives an ask at its root and keeping the page and window its ask was left with.
- `transcript.ts` — the transcript pane: facts folded as they arrive and drawn on either of pi-tui's screens, an ask of its own rows kept paged and windowed like any other.

## Keep

- A pane draws every line, unwindowed: pi-tui windows, scrolls, searches and selects what sits in the scroll view that holds it. An ask is the one thing a pane draws windowed, by its own rule, for its room is the host's and its page and window its state.
- A pane answers a gesture on the screen it last drew, which is the one the person acted on.
