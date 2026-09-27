# Session

A person runs `dsh --profile binnacle` and is given a terminal session with an agent on dsh's default model. Ctrl+C quits. `--check` opens a session, reports its model and closes it, drawing nothing. `--help` lists the flags.

## How it works

The host reads the invocation through dsh's command line. Once the launcher commits startup, it opens one agent on the default model and follows its session log from the first event (`binnacle:packages/binnacle/src/host/session.ts#openSession`). It holds the terminal until the person quits (`binnacle:packages/binnacle/src/host/index.ts#apply`). On a failure it cannot recover from, it gives back what it took, says what failed, and asks the launcher to exit 1.

## Choices

- The agent is composed as dsh's headless bundle composes one, with no preset roster: its rows come from the global layer, and its model from the default selection.
- `--check` draws nothing, so the boot check (`binnacle:scripts/check-boot.mjs`) and a person can each see that the profile opens a session without a terminal.
- Quitting is answered by the host, whatever is placed ([ADR 11](../adr/0011-placements-reach-the-whole-screen-and-the-built-in-surface-is-placed-through-them.md)).

## Open

- [#1](https://github.com/patrick-xin/binnacle/issues/1): the host matches Ctrl+C itself, not through a key table.
