# panes

The pi-tui components the host mounts: the transcript, and what a plugin placed. A pane holds UI state and answers a person's pointer and keys through `ui`'s gesture table; what is drawn is `views`', and mounting, scrolling and the terminal are the host's and pi-tui's.

- `placed.ts` — the fence every drawing a plugin places is called through, and how what went wrong is drawn.
- `screen.ts` — the screen pane: a placed screen in the transcript's place, or placed lines around or in the composer's seat.
- `transcript.ts` — the transcript pane: facts folded as they arrive and drawn on either of pi-tui's screens.

## Keep

- A pane draws every line, unwindowed: pi-tui windows, scrolls, searches and selects what sits in the scroll view that holds it.
- A pane answers a gesture on the screen it last drew, which is the one the person acted on.
