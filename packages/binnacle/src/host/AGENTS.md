# host

The one layer that touches the terminal and the process: it reads the invocation, opens the session, provides the `binnacle` service and mounts the panes in pi-tui's screens. Every layer below it is a function of facts, UI state and a size; this is where those meet a real process, dsh's services and the launcher.

- `index.ts` — the Cordis row: parses the invocation, then reports the model (`--check`) or takes the terminal until the person quits, on the alternate or main screen; reads the log again when an adapter comes or goes.
- `registrations.ts` — the `binnacle` service: the author API's registrations, kept for the host to adapt and draw with.
- `session.ts` — the session the surface draws: one agent on the default model, its log followed from the first event.

## Keep

- `session.ts` is where binnacle reaches dsh's agents; the rest of the host knows only the session it opens.
