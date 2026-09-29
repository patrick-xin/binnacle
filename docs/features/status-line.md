# Status line

Under the composer, one muted line says what the session runs and where it stands: `deepseek/deepseek-v4 · 12.4k tokens · 38% of context`. While a notice stands, the line says it instead — what a second Ctrl+C does ([Session](session.md)), or what an author's `submit` did wrong ([Authoring](authoring.md)) — and says the session again once the notice goes. It is the last line of the page, on either screen ([TUI mode](tui-mode.md)).

## How it works

The status line is a built-in plugin (`binnacle:packages/binnacle/src/plugins/status-line/index.ts#apply`), holding only what an author holds: it names the `binnacle` service, placing its line in the slot below the composer through `ctx.binnacle.place` (`binnacle:packages/binnacle/src/api.ts#Registrations`), as any plugin places a line there — one an author places in the same slot draws beneath it, and one placed above the composer draws between the transcript and the composer ([Authoring](authoring.md)).

What it says of the session it reads from dsh itself, never from a shape of binnacle's: the agent on screen, which `ctx.binnacle.agent()` hands it ([Authoring](authoring.md)), and dsh's session projections, through the `sessionProjections` service it names in `inject`. The model is the one the session's latest request header names, or before its first request the one the agent opened on; the tokens used and the context filled are the token meter's projections, where dsh-base mounts it. What dsh has not measured yet is left out, never guessed, so a session before its first request says only its model. A notice binnacle raises is handed to it in the surface (`binnacle:packages/binnacle/src/api.ts#Surface`), as to every lines drawing. The line is drawn again as the session logs anything, as its agent starts or ends a turn, and as the token meter's projections change on dsh's own change feed (`ctx.sessionProjections.onChanged`), for which it asks `ctx.binnacle.redraw()`. It is drawn in the muted tone ([Theme](theme.md)).

## Choices

- The Status line is a row of binnacle's patch, `binnacle-status-line`, so a person removes it by disabling that row in their profile's patch ([Authoring](authoring.md#removing-a-built-in-feature)).
- The model is named as `provider/model`, as the session asks for it.
- The tokens used are all the meter counts — sent, received and read from the cache — as one count: `517`, `12.4k`, `1.2m`, dsh web's compact count (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`) restated lowercase.
- The share of context is rounded as dsh web's occupancy meter rounds it (`dsh:packages/client/ui-conversation/src/client/context-occupancy.ts#contextOccupancy`), never past full: `38% of context`.
- What is not measured is left out, and the parts join with ` · `.
- A notice takes the line's place while it stands; how long one stands is for what raised it to say ([Session](session.md), [Authoring](authoring.md)).
- The line is drawn in the muted tone: chrome a person reads without reading.
- The line sits below the composer, the last line of the page; a person who wants more around it asks an author to place lines of their own above and below it.

## Open

- Cost is not shown: dsh has no seam for it yet ([#32](https://github.com/patrick-xin/binnacle/issues/32)).
