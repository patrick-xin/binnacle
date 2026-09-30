# src

binnacle's source: layers, each importing only what [`layers.json`](../layers.json) lets it, the author API over them, and the entry the bundle loads. The harness, the session and its log are dsh's; drawing, the terminal's screens and scrolling are pi-tui's; plugins and their lifecycle are Cordis'.

- `contract/` — what otherwise-independent layers share: affordances, regions, gestures and actions.
- `facts/` — one dsh session event as one fact.
- `models/` — facts folded into the transcript's turns.
- `ui/` — nodes and their layout, the theme, the key and gesture tables, and UI state.
- `views/` — how each transcript entry, and the whole screen, is drawn.
- `panes/` — the pi-tui components that hold UI state and answer a person: the transcript and what plugins placed.
- `api.ts` — the author API: what an author, or a built-in feature, may depend on — the `binnacle` service and the types its registrations take and return.
- `plugins/` — binnacle's built-in features, each a plugin holding only what an author holds.
- `host/` — the one layer that touches the terminal and the process: the Cordis row, the session and the `binnacle` service.
- `index.ts` — binnacle's entry: the Cordis row the bundle patch inserts, and the author API's types. Each built-in feature is a row of its own, loaded from its subpath (`plugins/<feature>`).

## Keep

- Removing or renaming an export of `api.ts` breaks every author; its commit says so.

## Where a change goes

| To | Change | Tested in |
|---|---|---|
| read a kind of dsh event, or quiet one | its adapter, in `binnacle:packages/binnacle/src/facts/adapt.ts#adapt`, and its name in the kinds table | `test/facts/adapt.test.ts`, `test/facts/kinds.test.ts` |
| draw a kind of entry | binnacle's own drawing, `binnacle:packages/binnacle/src/views/entries.ts#drawEntry`; or a view a feature registers | `test/views/entries.test.ts`, or the feature's |
| draw a kind of tool card | a row in its own file in `plugins/tool-cards/`, registered in the plugin's `apply` with `binnacle.card` (`binnacle:packages/binnacle/src/api.ts#Registrations`) | `test/plugins/tool-cards/` |
| change a glyph, a colour or how a fold starts | the theme: a mark, a piece of chrome, a tone, a kind's fold start | the tests of what draws it |
| let a view draw something new | a node in `binnacle:packages/binnacle/src/ui/node.ts#Node`, read in `binnacle:packages/binnacle/src/ui/node.ts#parseNode` and laid out in `binnacle:packages/binnacle/src/ui/layout.ts#layout`; it joins the author API | `test/ui/layout.test.ts` |
| give a gesture a meaning | `binnacle:packages/binnacle/src/ui/gestures.ts#meaning`; a new key is a binding in `binnacle:packages/binnacle/src/ui/keys.ts#BINNACLE_BINDINGS` first | `test/ui/gestures.test.ts`, `test/ui/keys.test.ts` |
| keep something a person changed about the screen | `binnacle:packages/binnacle/src/ui/state.ts#UiState`, and what an action does to it in `binnacle:packages/binnacle/src/ui/state.ts#act` | `test/ui/state.test.ts` |
| place a screen of a feature's own | a registration through the author API (`binnacle:packages/binnacle/src/api.ts#PlacedScreen`), drawn by `binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane` in the transcript's place on the alternate screen, opened by the host | `test/host/registrations.test.ts`, `test/panes/screen.test.ts`, `test/host/index.test.ts` |
| place a line around the composer, or take the composer's place | a placement through the author API (`binnacle:packages/binnacle/src/api.ts#Placement`), laid out by the host with what is placed | `test/host/index.test.ts` |
| add a built-in feature | a folder in `src/plugins/` whose `index.ts` is the plugin (`name`, `inject`, `apply`); its subpath in `package.json`'s `exports`; a row in [the patch](../cordis.patch.yml), `binnacle-<feature>`, which the host test's `mount` applies too — or, bound to the session's agent, applied by the host on its scope; and a page in [the feature map](../../../docs/features.md) | `test/plugins/<feature>/`, `test/artifact.test.ts` |
| reach the terminal, the process or dsh's runtime | the host; a plugin reaches a dsh service by naming it in `inject` | `test/host/index.test.ts` |
| share something between two features | move it down into a layer; what a plugin needs from it at run time joins the author API, by decision ([ADR 5](../../../docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)) | the layer's tests |

A module's tests mirror its path under `test/`, and what more than one test builds is in `test/support/`; how to write them is the root `AGENTS.md`'s *Tests*.
