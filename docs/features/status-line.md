# Status line

Under the composer, one muted line names the model the session runs, as `provider/model` — `deepseek/deepseek-v4` — so a person knows what they are talking to without asking. It is the last line of the page, on either screen ([TUI mode](tui-mode.md)).

## How it works

The status line is a built-in plugin (`binnacle:packages/binnacle/src/plugins/status-line/index.ts#statusLine`), holding only what an author holds: it places its line in the slot below the composer through `ctx.binnacle.place` (`binnacle:packages/binnacle/src/api.ts#Registrations`), as any plugin places a line there — one an author places in the same slot draws beneath it, and one placed above the composer draws between the transcript and the composer ([Authoring](authoring.md)). The model it names it reads where and when the session reads it: dsh's default model selection, through the `agentDefaultModel` service the plugin names in `inject` (`dsh:packages/core/agent-default-model/src/index.ts#AgentDefaultModelConfig`), as `provider/model` — read at the commit of startup (`dsh:packages/boot/cmdline/src/index.ts#AppReady`), the tick the session reads it, so however the default changes around the opening, before the commit or while the agent is being created, the line names the model the session runs. The line is drawn in the muted tone ([Theme](theme.md)).

## Choices

- The model is named as `provider/model`, the two words dsh's selection gives.
- The line is drawn in the muted tone: chrome a person reads without reading.
- The line sits below the composer, the last line of the page; a person who wants more around it asks an author to place lines of their own above and below it.

## Open

- [#32](https://github.com/patrick-xin/binnacle/issues/32): the line names the default model the session opened on, not the live session; a change of model mid-session, usage and cost join when it moves onto the live session.
