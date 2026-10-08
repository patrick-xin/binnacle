# Features

Each feature has a doc in `features/`: what a person can do, what an author can change, how it is built so far, and the Specs and PRs that built it. The code is the source of truth, and a feature's doc is the second source, beside it. A change to a feature edits its doc in the same commit.

Each feature is a plugin with a row of its own in the bundle's patch ([ADR 1](adr/0001-a-feature-is-a-cordis-plugin-on-the-binnacle-service.md)). A person turns a feature off by its row: `- id: <row>` and `disabled: true` in their profile's `cordis.patch.yml`. The core, row `binnacle`, is not a feature that can be turned off: it owns the terminal, and every feature needs it.

`pnpm test` checks that this table, the docs in `features/` and the bundle's patch agree. It also checks that a branch which changes a feature's code changes its doc, by the longest path under **Code** that holds the changed file. A commit whose change leaves the doc true says so, with a line `Feature doc unchanged: <Feature>, <why>`.

| Feature | Doc | Rows | Code |
|---|---|---|---|
| Core | [core](features/core.md) | `binnacle` | `packages/binnacle/src/` |
| Gestures | [gestures](features/gestures.md) | `binnacle` | `packages/binnacle/src/core/gestures.ts`, `packages/binnacle/src/core/input.ts`, `packages/binnacle/src/core/keyboard.ts`, `packages/binnacle/src/core/actions.ts` |
| Transcript | [transcript](features/transcript.md) | `binnacle-transcript` | `packages/binnacle/src/plugins/transcript/` |
| Composer | [composer](features/composer.md) | `binnacle-composer` | `packages/binnacle/src/plugins/composer/` |
| Status line | [status line](features/status-line.md) | `binnacle-status-line` | `packages/binnacle/src/plugins/status-line/` |
| Requests | [requests](features/requests.md) | `binnacle-approvals`, `binnacle-questions` | `packages/binnacle/src/plugins/approvals/`, `packages/binnacle/src/plugins/questions/`, `packages/binnacle/src/plugins/requests/` |
