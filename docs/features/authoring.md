# Authoring

A plugin in a person's profile, written by them or by an author agent they ask, changes what binnacle draws through `ctx.binnacle`. An adapter reads one kind of session event as a fact of the author's own. A view draws one kind of entry — a built-in kind, or a quiet kind by its dsh event type ([Transcript](transcript.md)) — building on binnacle's drawing or replacing it. Disposing the plugin gives back everything it registered.

## How it works

The registrations are the author API (`binnacle:packages/binnacle/src/api.ts#Registrations`), provided by the host's `binnacle` service (`binnacle:packages/binnacle/src/host/registrations.ts#RegistrationService`).

- A view draws with blocks in the theme's tones (`binnacle:packages/binnacle/src/ui/node.ts#Node`, [ADR 10](../adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)); a span may name a mark, and the theme draws its glyph in the mark's tone, or in a tone the span names beside it ([Theme](theme.md)); and no text it returns reaches the terminal as a control: every string a node carries is drawn as text ([ADR 14](../adr/0014-no-text-a-node-carries-reaches-the-terminal-as-a-control.md)).
- Views of one key stack, and the newest draws on what the one beneath it draws ([ADR 8](../adr/0008-a-view-builds-on-the-one-beneath-it-and-the-newest-draws.md)).
- A view names its regions within its entry: binnacle scopes each id a view returns to the entry that drew it, by that entry's first fact's place in the log (`binnacle:packages/binnacle/src/views/screen.ts#screens`), so one name in two entries is two regions, and two views of one entry that name a region alike — binnacle's own card and the tool cards naming a call's result `output` — share what a person did to it, across a redraw, a change of adapters that reads the log again, a switch of screens, and the coming and going of plugins. binnacle's own views and the tool cards name their regions by what they are (`output`, `reasoning-<n>`), never by their entry.
- A view is drawn once for each entry, and again when its author invalidates its key ([ADR 9](../adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)).
- A change of adapters reads the whole log again.
- What an author's adapter or view does wrong is drawn by the one beneath, naming the registration and why (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`); it never takes the surface down.

Why an author reaches what the built-in surface reaches is [ADR 0](../adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)'s.
