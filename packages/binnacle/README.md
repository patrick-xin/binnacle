# The binnacle bundle

The package dsh loads: a Cordis plugin that [its patch](cordis.patch.yml) inserts into the profile, which takes the terminal and draws a dsh session with pi-tui. This page is the map of its code: what each layer is for, how a session and a gesture pass through them, and where a change goes.

What binds is [`AGENTS.md`](../../AGENTS.md). What each layer may import is [`layers.json`](layers.json), held by `check:layers`, whose error says what to change. Why the code is shaped this way is [the architecture](../../docs/architecture.md).

## The layers

From the bottom up; each knows only the layers beneath it that `layers.json` names.

- **`contract`** is what layers that know nothing of each other share: the affordances content offers, the regions that carry them, the gestures that land on regions and the actions they mean (`binnacle:packages/binnacle/src/contract/index.ts#Action`).
- **`facts`** is the one place dsh's session events are read. Each event becomes a typed fact (`binnacle:packages/binnacle/src/facts/adapt.ts#adapt`); a kind with no adapter becomes an `unknown` fact, never dropped. Nothing above it knows dsh's event shapes.
- **`models`** folds facts into turns and their entries (`binnacle:packages/binnacle/src/models/transcript.ts#fold`), purely, so a live session and a replayed log reach the same transcript.
- **`ui`** is what drawing and input are made of, with no knowledge of a session:
  - the nodes a view draws with, as data (`binnacle:packages/binnacle/src/ui/node.ts#Node`), laid out with pi-tui at a width (`binnacle:packages/binnacle/src/ui/layout.ts#layout`) once every string they carry is made inert (`binnacle:packages/binnacle/src/ui/readable.ts#readable`);
  - the theme: tones (`binnacle:packages/binnacle/src/ui/theme.ts#tones`), marks (`binnacle:packages/binnacle/src/ui/theme.ts#marks`) and the chrome's glyphs (`binnacle:packages/binnacle/src/ui/theme.ts#chrome`);
  - input: the one key table (`binnacle:packages/binnacle/src/ui/keys.ts#keyTable`), the pointer read as gestures (`binnacle:packages/binnacle/src/ui/pointer.ts#gestureOf`), the gesture table that gives a gesture its meaning (`binnacle:packages/binnacle/src/ui/gestures.ts#meaning`), and UI state, what a person opened and focused (`binnacle:packages/binnacle/src/ui/state.ts#act`).
- **`views`** draws each kind of entry as nodes (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`), authors' views stacked over binnacle's own and fenced, and draws the whole screen from them (`binnacle:packages/binnacle/src/views/screen.ts#screens`): each entry drawn once and kept, its regions scoped to it.
- **`panes`** joins the views to pi-tui: the transcript as a component on either of pi-tui's screens (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`), and a screen a plugin placed, drawn over whichever is live (`binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane`). It folds facts as they arrive, holds UI state, answers gestures, and on the main screen prints what has settled.
- **`api.ts`** is the author API (`binnacle:packages/binnacle/src/api.ts#Registrations`): the `binnacle` service and the types its registrations take. It is what an author, and a built-in feature, may depend on.
- **`plugins`** holds the built-in features, one folder each, each registering through the author API as an author would (`binnacle:packages/binnacle/src/plugins/tool-cards/index.ts#toolCards`).
- **`host`** is the one layer that touches the terminal, the process and dsh's runtime. It opens the session (`binnacle:packages/binnacle/src/host/session.ts#openSession`), provides the `binnacle` service (`binnacle:packages/binnacle/src/host/registrations.ts#RegistrationService`), applies the plugins, and builds the screens and the input around the pane.

`src/index.ts` is the entry: the row the patch inserts, and the author API's types.

## How a session reaches the screen

The host opens a session and follows its log. Each event is adapted to a fact and handed to the pane, which folds it into turns. At each frame the pane draws the screen: each entry drawn as nodes, by the newest view registered for its kind over the one beneath it, down to binnacle's own; the regions it names scoped to the entry; and the nodes laid out with pi-tui at the width it was given, so that no text a node carries reaches the terminal as a control ([ADR 14](../../docs/adr/0014-no-text-a-node-carries-reaches-the-terminal-as-a-control.md)). An entry is drawn once, and drawn again only when it changes, the views of its kind change, or their author invalidates them; it is laid out again only at a new width or as a fold in it opens. So a frame costs what changed, and hands pi-tui every line ([ADR 9](../../docs/adr/0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)). On the main screen, the pane prints each entry once it has settled (`binnacle:packages/binnacle/src/models/transcript.ts#settled`), keeps what it printed as it printed it, and draws the rest below.

## How a gesture is answered

- **A key** reaches the host ahead of the composer. The key table resolves it to a binding: the host answers its own, quitting and switching screens, and the key that opens a placed screen, which the host opens, closes, or reads a scroll from while it is open; a gesture goes to the pane, which asks the gesture table what it means on the focused region, and applies the action to UI state. A key nothing answers goes to the composer, typed. While a placed screen is open it takes the rest: nothing moves the transcript or the composer beneath it.
- **The pointer** reaches the pane as pi-tui's mouse event, read as a gesture, and the gesture table gives it its meaning on the regions under it. What the table leaves unanswered — the wheel, a drag — is pi-tui's: it scrolls and selects ([ADR 7](../../docs/adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).

## Where a change goes

| To | Change | Tested in |
|---|---|---|
| read a kind of dsh event | its adapter, in `binnacle:packages/binnacle/src/facts/adapt.ts#adapt` | `test/facts/adapt.test.ts` |
| draw a kind of entry | binnacle's own drawing, `binnacle:packages/binnacle/src/views/entries.ts#drawEntry`; or a view a feature registers | `test/views/entries.test.ts`, or the feature's |
| draw a kind of tool card | a row in its own file beside the card table, and the row named in it (`binnacle:packages/binnacle/src/plugins/tool-cards/cards.ts#rowFor`) | `test/plugins/tool-cards/` |
| change a glyph or a colour | the theme: a mark, a piece of chrome, a tone | the tests of what draws it |
| let a view draw something new | a node in `binnacle:packages/binnacle/src/ui/node.ts#Node`, read in `binnacle:packages/binnacle/src/ui/node.ts#parseNode` and laid out in `binnacle:packages/binnacle/src/ui/layout.ts#layout`; it joins the author API | `test/ui/layout.test.ts` |
| give a gesture a meaning | `binnacle:packages/binnacle/src/ui/gestures.ts#meaning`; a new key is a binding in `binnacle:packages/binnacle/src/ui/keys.ts#BINNACLE_BINDINGS` first | `test/ui/gestures.test.ts`, `test/ui/keys.test.ts` |
| keep something a person changed about the screen | `binnacle:packages/binnacle/src/ui/state.ts#UiState`, and what an action does to it in `binnacle:packages/binnacle/src/ui/state.ts#act` | `test/ui/state.test.ts` |
| place a screen of a feature's own | a registration through the author API (`binnacle:packages/binnacle/src/api.ts#PlacedScreen`), drawn by `binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane`, opened by the host over whichever screen is live | `test/host/registrations.test.ts`, `test/panes/screen.test.ts`, `test/host/index.test.ts` |
| add a built-in feature | a folder in `src/plugins/`, applied by the host, with a page in [the feature map](../../docs/features.md) | `test/plugins/<feature>/` |
| reach the terminal, the process or dsh's runtime | the host; a plugin reaches a dsh service by naming it in `inject` | `test/host/index.test.ts` |
| share something between two features | move it down into a layer; what a plugin needs from it at run time joins the author API, by decision ([ADR 5](../../docs/adr/0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)) | the layer's tests |

A module's tests mirror its path, and what more than one test builds is in `test/support/`; how to write them is `AGENTS.md`'s *Tests*.
