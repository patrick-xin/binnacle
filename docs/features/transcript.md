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
- How one type of event is drawn: the Look `transcript.event.<type>`, such as `transcript.event.tool/call`, or every event's with `transcript.event`, beneath them. Given the event and `{ folded, width }`, it returns the event's lines, such as a tool call as one line cut at the width. An event whose Look draws no line takes no row.
- Read an event without knowing dsh's shapes, with the readers from `binnacle/plugins/transcript`: `textOf(event)`, the text of a person's message or an answer's; `isPrompt(event)`, whether it is a prompt the person typed; `failed(event)`, whether it is a tool result that failed; and `withoutReasoning(event)`, the event with its reasoning taken out. Such as a Look that draws each prompt as `> <text>`, or hides an answer's reasoning with `beneath(withoutReasoning(event), at)`.
- How the answer that streams is drawn: the Look `transcript.live`, given its blocks and the width, such as with its reasoning left out.
- Replace the transcript: turn off its row, and place a Part of their own in the `transcript` Place.

## How it is built

- **Raw events**, as the Intent's Stage 2 asked: grouping and styling come later, and an author can do them too.
- **Wide content wraps**, as in pi: the core wraps each line at the width.
- **The Mark is the Part's cursor**, on the Marked event's header line, so the core keeps it in view.
- **The model `transcript`** is `{ events, live, folded, marked }`. The transcript keeps its own events and live blocks, and sets them on the model at each event and each frame, so an author who sets `events` or `live` has them replaced then. `folded` and `marked` are only the model's: the actions, the Focus and an author change them, and the view draws them. An array is what a Model's `set` changes in place, as `folded.push(seq)`.
- **The live blocks** are in the answer's order, each a `kind`, `text`, `reasoning` or `tool-call`, its `text`, and a tool call's `name` once dsh gives it, as dsh's deltas carry it. The view makes the name plain when it draws it.
- **A Look for each event, by its type, then `transcript.event`**, as an instance's Look lies on its kind's. Its type is `EventLook`, and the live block's is `LiveLook`. The default draws the header, then the JSON, then a blank line, or the header with its count while folded. The JSON of an event's data is made once, when the event comes.
- **Each Look is called at each draw**, as a Part's lines are, so the lines follow the theme, the Looks and their models. Each frame of a streaming answer calls every committed event's Look: a cost the prototype accepts. If a long session is slow, the fix is a cache that the core tells of each change.
- **The view Marks and folds**, not the Look: the Mark is the inverse video of an event's first line, set again after each style sequence in it, so a reset in any form does not end it, and the Look is told whether its event is folded.
- **Where the Mark is drawn:** on the Marked event if it draws a line, else the next event that draws, else the one before, else nowhere. The same holds for a `marked` that is no event. Drawing never changes `marked`, so the Mark comes back to its event when it draws again. Up and down move from where the Mark is drawn, among the events that draw, and set `marked` to the event they reach. Enter folds the event where the Mark is drawn, which a person sees Marked.
- **A click lands on what was drawn:** on the event whose first line it is, in the lines drawn last.
- **The keys are actions** of the Place `transcript`: `transcript.up`, `transcript.down` and `transcript.fold` take the Gesture Table's `tui.select.up`, `tui.select.down` and `tui.select.confirm` keys by default, and `transcript.click` takes `click`. The Part takes no key, so a key that would type does nothing, and esc still interrupts. Up and down at the ends, and each action while no event is Marked, do nothing.
- **The readers of an event** read its data as unknown, so each is safe on any type and any shape. `textOf` reads `user/message` and `assistant/message`, and joins their `text` blocks with nothing between, as dsh does. `isPrompt` is a `user/message` whose `source.kind` is `user`: dsh gives each producer of context its own kind. `failed` is a `tool/result` whose message has `isError`, or that has an `error`. `withoutReasoning` takes the `reasoning` blocks out of an `assistant/message`'s message, and out of the stream of an `assistant/message` or an `assistant/attempt`: the `reasoning-chunks` records, and each `chunk` record of a reasoning delta, or of the start or the end of a reasoning block. It makes a new event, and gives an event with no reasoning as it is, so the default Look keeps the JSON it made when the event came.
- **The live block is not an event**: it cannot be Marked or folded.

## Built by

Stage 2 (before Specs) · Spec [#159](https://github.com/patrick-xin/binnacle/issues/159) · PR [#168](https://github.com/patrick-xin/binnacle/pull/168) · Spec [#248](https://github.com/patrick-xin/binnacle/issues/248) · Ticket [#249](https://github.com/patrick-xin/binnacle/issues/249): the model `transcript`, and its actions · Ticket [#250](https://github.com/patrick-xin/binnacle/issues/250): a Look for each type of event, and for the live block. · Ticket [#254](https://github.com/patrick-xin/binnacle/issues/254): readers of an event.
