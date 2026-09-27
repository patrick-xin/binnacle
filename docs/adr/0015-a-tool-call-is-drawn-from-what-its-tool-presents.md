# 15. A tool call is drawn from what its tool presents

- Status: accepted
- Date: 2026-10-04

## Context

A tool call in the session log carries the tool's name and the arguments the model wrote — raw JSON, valid or not. binnacle's own card drew exactly that, so a person read `bash {"command":"pnpm test"}` where they could have read what the call does. Every tool already knows what its calls mean: dsh lets a tool declare how one of its calls renders, two pure functions on its definition returning a view tagged by the kind of card it draws, read in dsh's tool registry source, at dsh-v0.1.7-rc.2. A surface reaches the definition through dsh's `tools` service.

Who reads the presentation is the decision. dsh's own web client reads each tool's arguments and payload by name — a view module per known tool — read in its client source, at dsh-v0.1.7-rc.2.

## Decision

**binnacle draws each tool call from what its tool presents, reached through the `tools` service — never by reading a tool's arguments or payload by name.**

- The card that draws a call is the tool's own presentation of it, and its completed state the presentation of its result. Both are pure functions of the logged call, so a replayed session draws the same screen as a live one.
- Where nothing presents a call — no tool of that name, no presenter, arguments that are not JSON, a presenter that throws or returns a view binnacle does not draw — the entry is left to the view beneath, binnacle's own card. Presenter code is not binnacle's: what it returns is parsed where it enters, and nothing it does takes the surface down.
- Which kind of card draws how is a table binnacle grows a row at a time; a kind with no row yet draws by its title alone.

The cards are a built-in plugin holding only what an author holds ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)), so an author replaces or removes them by registering a view for the `tool` kind, as for anything built in. Naming dsh's `tools` service widens a seam ([ADR 3](0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)): a key in `inject` and a package line in `layers.json`.

## Alternatives considered

**binnacle reads each tool's arguments and payload by name, as dsh's web client does.** A card per known tool, keyed by name, with no dependence on presenters. It lost because the surface becomes the place every tool's shape is re-learned: a new tool, and every tool an author's preset runs, renders as raw JSON until someone writes its card into binnacle — when the tool itself could have said, once, for every surface.

**binnacle keeps drawing each call as its name and raw arguments, presenters unused.** Nothing new to reach in dsh, no parsing of foreign returns. It lost because it answers the person's first question about a call — what is it doing — with the model's spelling of it, which is exactly what the presenter vocabulary exists to fix.

## Consequences

- A tool that presents nothing keeps binnacle's own card, so a preset's tools are never invisible, only unpresented.
- What a presenter is handed — the result's content rebuilt from its text blocks, whether it failed, its meta as logged — is a seam in both directions: it must keep working for replay, so it stays a pure function of what the log holds.
- Every card kind will need its own row in the table before it draws as more than a title; until then a capable tool's card under-reads, deliberately.
