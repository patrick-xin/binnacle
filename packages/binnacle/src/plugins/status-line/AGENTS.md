# plugins/status-line

The Status line: one muted line under the composer saying the model the session runs, the tokens it has used and the share of its context, with a notice in its place while one stands. It holds the `binnacle` service to place its line; what it says is read from the session by the host.

- `index.ts` — the plugin: places the line, and formats counts and shares as dsh web does.
