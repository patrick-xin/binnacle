# Transcript

Row `binnacle-transcript` · Code `binnacle:packages/binnacle/src/plugins/transcript/index.ts#apply` · Intent: [Authoring](../../intents/authoring/intent.md)

## What a person can do

- Read the session's events in the Chat's transcript Place, raw: each event's seq and type, then its data as JSON.
- Watch the answer stream as one live block, each content block's deltas glued, until the event it commits replaces it.
- Scroll the transcript with the wheel.
- Give the transcript the Focus: the newest event is Marked, in inverse video. Up and down move the Mark one event, and stop at the ends.
- Fold the Marked event with enter, to its header line, which ends with how many of its lines it hides: `▸ #<seq> <type> (<n> lines)`. A click on an event's header line folds or unfolds it, and Marks it.
- Keep the folds and the Mark as events come and the live block streams. The Mark is not drawn while the transcript has no Focus, and the same event is Marked when it comes back.

## What an author can change

- Read the transcript's state: the model `transcript`, `binnacle.modelOf('transcript')`, of the type `TranscriptState` from `binnacle/plugins/transcript`. It holds `events`, `live`, `folded` and `marked`.
- Fold an event, or Mark it: set `folded`, an array of seqs, or `marked`, a seq. Such as each tool result folded when it comes, from a watcher of the model.
- The keys that move the Mark and fold: `binnacle.bind('transcript.up', …)`, `transcript.down` and `transcript.fold`, such as `j` and `k` to move the Mark.
- What a key or a click does: set `transcript.up`, `transcript.down`, `transcript.fold` or `transcript.click` by its id, and run `beneath()` to keep the default.
- Replace the transcript: turn off its row, and place a Part of their own in the `transcript` Place.

How one type of event is drawn cannot be changed alone yet.

## How it is built

- **Raw events**, as the Intent's Stage 2 asked: grouping and styling come later, and an author can do them too.
- **Wide content wraps**, as in pi: the core wraps each line at the width.
- **The Mark is the Part's cursor**, on the Marked event's header line, so the core keeps it in view.
- **The model `transcript`** is `{ events, live, folded, marked }`. The transcript keeps its own events and live blocks, and sets them on the model at each event and each frame, so an author who sets `events` or `live` has them replaced then. `folded` and `marked` are only the model's: the actions, the Focus and an author change them, and the view draws them. An array is what a Model's `set` changes in place, as `folded.push(seq)`.
- **The live blocks** are in the answer's order, each a `kind`, `text`, `reasoning` or `tool-call`, its `text`, and a tool call's `name` once dsh gives it, as dsh's deltas carry it. The view makes the name plain when it draws it.
- **The committed lines are kept** while the live block streams, and built again only when the events, `folded`, `marked` or the Focus change.
- **The keys are actions** of the Place `transcript`: `transcript.up`, `transcript.down` and `transcript.fold` take the Gesture Table's `tui.select.up`, `tui.select.down` and `tui.select.confirm` keys by default, and `transcript.click` takes `click`. The Part takes no key, so a key that would type does nothing, and esc still interrupts. Up and down at the ends, and each action while no event is Marked, do nothing.
- **The live block is not an event**: it cannot be Marked or folded.

## Built by

Stage 2 (before Specs) · Spec [#159](https://github.com/patrick-xin/binnacle/issues/159) · PR [#168](https://github.com/patrick-xin/binnacle/pull/168) · Spec [#248](https://github.com/patrick-xin/binnacle/issues/248) · Ticket [#249](https://github.com/patrick-xin/binnacle/issues/249): the model `transcript`, and its actions.
