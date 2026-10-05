# Features

Each feature is a plugin with a row of its own in the bundle's patch ([ADR 1](adr/0001-a-feature-is-a-cordis-plugin-on-the-binnacle-service.md)). A person turns a feature off by its row: `- id: <row>` and `disabled: true` in their profile's `cordis.patch.yml`. The core, row `binnacle`, is not a feature: it owns the terminal, and every feature needs it.

`pnpm test` checks that this table and the bundle's patch name the same rows.

| Feature | What a person sees | Row | Code |
|---|---|---|---|
| Read view | A stored session as its raw events: each event's seq and type, then its data as JSON. The wheel scrolls it. `--session <id>` picks the session; the newest is the default. Stage 2 makes it the transcript. | `binnacle-read` | `binnacle:packages/binnacle/src/plugins/read/index.ts#apply` |
