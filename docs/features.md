# Features

Each feature is a plugin with a row of its own in the bundle's patch ([ADR 1](adr/0001-a-feature-is-a-cordis-plugin-on-the-binnacle-service.md)). A person turns a feature off by its row: `- id: <row>` and `disabled: true` in their profile's `cordis.patch.yml`. The core, row `binnacle`, is not a feature: it owns the terminal, and every feature needs it.

`pnpm test` checks that this table and the bundle's patch name the same rows.

| Feature | What a person sees | Row | Code |
|---|---|---|---|
| Transcript | In the Chat's transcript Place, the session's events, raw: each event's seq and type, then its data as JSON. The answer that streams is one live block, each content block's deltas glued, until the event it commits replaces it. The wheel scrolls it. With the Focus, the newest event is Marked, and up and down move the Mark. Enter folds the Marked event to its header line, which ends with how many of its lines it hides. A click on an event's header line folds or unfolds that event, and Marks it. `dsh --profile binnacle` opens a new session; `--session <id>` reads a stored one, and nothing can be sent to it. | `binnacle-transcript` | `binnacle:packages/binnacle/src/plugins/transcript/index.ts#apply` |
| Composer | In the Chat's composer Place, the draft a person types, between two rules, with pi-tui's editor keys from the Gesture Table. Shift+enter is a new line, and a paste keeps its new lines. Enter sends the draft as a prompt, or steers the turn that runs, and keeps it in its history. A stored session takes nothing, so there Enter keeps the draft. Esc interrupts the turn that runs. Ctrl+c clears the draft; on an empty draft, pressed twice within half a second, it quits. | `binnacle-composer` | `binnacle:packages/binnacle/src/plugins/composer/index.ts#apply` |
| Status line | In the Chat's status Place, one line: whether the agent is idle or running, and its model. On a stored session, that it is read only, and its id. | `binnacle-status-line` | `binnacle:packages/binnacle/src/plugins/status-line/index.ts#apply` |
