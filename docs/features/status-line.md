# Status line

Row `binnacle-status-line` · Code `binnacle:packages/binnacle/src/plugins/status-line/index.ts#apply` · Intent: none yet

## What a person can do

- See one line in the Chat's status Place: whether the agent is idle or running, and its model, such as `idle · gpt-6-luna`.
- On a stored session, see that it is read only, and its id.

## What an author can change

- Replace the status line: turn off its row, and place a Part of their own in the `status` Place. It is the shortest built-in, and the simplest example of a plugin that places a Part and draws it again on a dsh event.

## How it is built

- It places one Part with one line, and draws it again on `agent/status` for the Chat's agent.
- The agent's status and model are Untrusted Text, made plain with `toPlainText`.

## Built by

Stage 2 (before Specs).
