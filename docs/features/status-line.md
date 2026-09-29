# Status line

Under the composer, one muted line says what the session runs and where it stands: `deepseek/deepseek-v4 · 12.4k tokens · 38% of context`. While a notice stands, the line says it instead — what a second Ctrl+C does ([Session](session.md)), or what an author's `submit` did wrong ([Authoring](authoring.md)) — and says the session again once the notice goes. It is the last line of the page, on either screen ([TUI mode](tui-mode.md)).

## How it works

The status line is a built-in plugin (`binnacle:packages/binnacle/src/plugins/status-line/index.ts#statusLine`), holding only what an author holds: it names only the `binnacle` service, placing its line in the slot below the composer through `ctx.binnacle.place` (`binnacle:packages/binnacle/src/api.ts#Registrations`), as any plugin places a line there — one an author places in the same slot draws beneath it, and one placed above the composer draws between the transcript and the composer ([Authoring](authoring.md)).

What it says it is handed, as every lines drawing is: the surface (`binnacle:packages/binnacle/src/api.ts#Surface`), where the session stands as the host reads it live from the session, never folded again from the log — the model from the session's latest request header, or the selection it opened on before its first request; the tokens used and the context filled from dsh's token meter, where dsh-base mounts it. What dsh has not measured yet is left out, never guessed, so a session before its first request says only its model. The line is drawn again as where the session stands changes, as it is for the facts. It is drawn in the muted tone ([Theme](theme.md)).

## Choices

- The model is named as `provider/model`, the two words the session's request names.
- The tokens used are all the meter counts — sent, received and read from the cache — as one count: `517`, `12.4k`, `1.2m`, dsh web's compact count (`dsh:packages/client/ui-chat/src/client/chat/token-format.ts#formatTokens`) restated lowercase.
- The share of context is rounded as dsh web's occupancy meter rounds it (`dsh:packages/client/ui-conversation/src/client/context-occupancy.ts#contextOccupancy`), never past full: `38% of context`.
- What is not measured is left out, and the parts join with ` · `.
- A notice stands in the line's place while one stands; how long one stands is what raised it to say.
- The line is drawn in the muted tone: chrome a person reads without reading.
- The line sits below the composer, the last line of the page; a person who wants more around it asks an author to place lines of their own above and below it.

## Open

- Cost is not shown: dsh has no seam for it yet ([#32](https://github.com/patrick-xin/binnacle/issues/32)).
