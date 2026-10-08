# Transcript

Row `binnacle-transcript` · Code `binnacle:packages/binnacle/src/plugins/transcript/index.ts#apply` · Intent: none yet

## What a person can do

- Read the session's events in the Chat's transcript Place, raw: each event's seq and type, then its data as JSON.
- Watch the answer stream as one live block, each content block's deltas glued, until the event it commits replaces it.
- Scroll the transcript with the wheel.
- Give the transcript the Focus: the newest event is Marked, in inverse video. Up and down move the Mark one event, and stop at the ends.
- Fold the Marked event with enter, to its header line, which ends with how many of its lines it hides: `▸ #<seq> <type> (<n> lines)`. A click on an event's header line folds or unfolds it, and Marks it.
- Keep the folds and the Mark as events come and the live block streams. The Mark is not drawn while the transcript has no Focus, and the same event is Marked when it comes back.

## What an author can change

- Replace the transcript: turn off its row, and place a Part of their own in the `transcript` Place.

How one type of event is drawn cannot be changed alone yet.

## How it is built

- **Raw events**, as the Intent's Stage 2 asked: grouping and styling come later, and an author can do them too.
- **Wide content wraps**, as in pi: the core wraps each line at the width.
- **The Mark is the Part's cursor**, on the Marked event's header line, so the core keeps it in view.
- **The keys** are the Gesture Table's `tui.select.up`, `tui.select.down` and `tui.select.confirm`. A key that would type does nothing, and esc still interrupts.
- **The live block is not an event**: it cannot be Marked or folded.

## Built by

Stage 2 (before Specs) · Spec [#159](https://github.com/patrick-xin/binnacle/issues/159) · PR [#168](https://github.com/patrick-xin/binnacle/pull/168).
