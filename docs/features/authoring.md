# Authoring

A plugin in a person's profile, written by them or by an author agent they ask, changes what binnacle draws through `ctx.binnacle`. An adapter reads one kind of session event as a fact of the author's own. A view draws one kind of entry, building on binnacle's drawing or replacing it. A screen a plugin places takes the transcript's place, opened with the key its plugin offers. Disposing the plugin gives back everything it registered.

## How it works

The registrations are the author API (`binnacle:packages/binnacle/src/api.ts#Registrations`), provided by the host's `binnacle` service (`binnacle:packages/binnacle/src/host/registrations.ts#RegistrationService`).

- A view draws with blocks in the theme's tones (`binnacle:packages/binnacle/src/ui/node.ts#Node`, [ADR 10](../adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)); a span may name a mark, and the theme draws its glyph in the mark's tone, or in a tone the span names beside it ([Theme](theme.md)); and no text it returns reaches the terminal as a control: every string a node carries is drawn as text ([ADR 14](../adr/0014-no-text-a-node-carries-reaches-the-terminal-as-a-control.md)).
- Views of one key stack, and the newest draws on what the one beneath it draws ([ADR 8](../adr/0008-a-view-builds-on-the-one-beneath-it-and-the-newest-draws.md)).
- A view names its regions within its entry: binnacle scopes each id a view returns to the entry that drew it, by that entry's first fact's place in the log (`binnacle:packages/binnacle/src/views/screen.ts#screens`), so one name in two entries is two regions, and two views of one entry that name a region alike — binnacle's own card and the tool cards naming a call's result `output` — share what a person did to it, across a redraw, a change of adapters that reads the log again, a switch of screens, and the coming and going of plugins. binnacle's own views and the tool cards name their regions by what they are (`output`, `reasoning-<n>`), never by their entry.
- A view is drawn once for each entry, and again when its author invalidates its key ([ADR 9](../adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)).
- A change of adapters reads the whole log again.
- What an author's adapter or view does wrong is drawn by the one beneath, naming the registration and why (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`); it never takes the surface down.

Why an author reaches what the built-in surface reaches is [ADR 0](../adr/0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)'s.

## Placing a screen

A plugin can place a screen of its own in the transcript's place, opened with a key: a review of the whole session, a settings page, anything a feature wants a person to read at length. `ctx.binnacle.screen(name, screen)` places one (`binnacle:packages/binnacle/src/api.ts#PlacedScreen`): its `draw` returns a node, as a view does, handed the session's facts read-only at each frame; nothing it does reaches the log.

- A placed screen is drawn in the alternate screen's scroll view, where the transcript is: pi-tui windows it, and its scrolling, search and selection are the alternate screen's own — nothing of them is restated. The composer below stays, and stays live: a line typed while a screen is open is sent as ever. This is codex's reading (`codex:codex-rs/tui/src/app_backtrack.rs`): its owned viewport shows the detailed transcript in place, and from an inline session it enters the alternate screen for it.
- From the main screen, opening switches to the fullscreen, and closing returns to the main screen as it was, its printed rows untouched. Leaving the fullscreen by Ctrl+T closes a placed screen too: it lives in the alternate screen's scroll view. Reopening finds it where it was scrolled, for its scroll view is kept while its registration stands.
- Its plugin offers the key that opens it — `screen.key`, pi-tui's name for a key — as a binding in the one key table, named `binnacle.screen.<name>` and described by `screen.description`. The same key, or Esc, returns to the transcript as it was: its scroll, focus and folds, exactly. A person can rebind it once rebinding lands ([Keys](keys.md)).
- While a placed screen is open no gesture moves on the transcript beneath; what the host answers itself still answers — quitting, switching screens.
- The newest registration of a name places the screen, as the newest view of a key draws; disposing the plugin takes back its screen and its key, closing it if it is open.
- What its `draw` does wrong — it throws, or returns no node binnacle can lay out — is drawn, naming its registration, and never takes the surface down.

### Choices

- A placed screen opens from its top, and where a person scrolled it is kept while its registration stands; the key it opens with, and what the key is called in help, are its plugin's choices.
- A screen's folds are drawn folded and its offers are not answered there: it is a page to read, not a surface to act on, so a screen that wants everything shown draws it without them.
