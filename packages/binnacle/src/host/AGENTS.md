# host

The one layer that touches the terminal and the process: it reads the invocation, opens the session, provides the `binnacle` service and mounts the panes in pi-tui's screens. The built-in features are rows of their own, started once it provides the service; it applies only those bound to the session's agent, Approvals and Questions, on that agent's scope once the session opens. Every layer below it is a function of facts, UI state and a size; this is where those meet a real process, dsh's services and the launcher.

- `index.ts` — the Cordis row: parses the invocation, then reports the model and the roster of presets the registry mounted (`--check`) or takes the terminal until the person quits, on the alternate or main screen; reads the log again when an adapter comes or goes; asks the terminal its colours, and listens for it turning light or dark, so the theme is drawn for it; shows the notices raised before the surface stood once it does.
- `registrations.ts` — the `binnacle` service: the author API's registrations and the theme-file grant, kept for the host to adapt and draw with, and the notices raised wherever they come from, held until the surface stands.
- `seats.ts` — the seats: every pane the host mounts in a place — the transcript, placed screens, placed lines — given what its place gives it from one table, keys and the scroll focus is brought into view on; the placed panes kept, invalidated and ticked in one walk, the transcript's own cache still called by the host.
- `session.ts` — the session the surface draws: one agent on the default model, bound to the preset the registry defaults to as it is created, its log followed from the first event, and its answer heard as it streams.
- `theme-file.ts` — the theme-file grant behind `ctx.binnacle.themeFile`: one file of the profile's `themes/` directory, read now and watched — and looked for again now and then, for a platform may coalesce a change away — its parsed JSON handed over as it changes and every problem raised as a notice naming its path.
- `check-theme.ts` — the theme checker the author skill points an agent at: run under plain `node` from `dist/`, it reads one file the way the theme row does and prints `ok` or the reading's own message, so the agent knows the authoritative reading before it writes into the profile.

## Keep

- `session.ts` is where binnacle reaches dsh's agents; the rest of the host knows only the session it opens.
