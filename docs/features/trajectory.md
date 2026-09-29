# Trajectory

A person reads everything the session logged — the conversation, and the machinery beneath it — on a screen of its own, turn by turn:

- every event one line: its place in the log, dim, its kind — a mark where one stands for it — and what it says in a few words. A `prompt` line carries its first line after the `prompt` mark; a `call` names its tool; a `result` says what it answered, with the `done` or `failed` mark; the machinery — quiet kinds — names its dsh type; a kind no view reads carries the `unknown` mark;
- the lines are grouped by turn, under a `turn N` heading in the accent tone, the machinery before the first turn under `before turn 1`;
- each line carries its record folded on it, saying how much it holds ([Transcript](transcript.md)'s fallback shape): a quiet or unknown event's line opens to the event as logged, and a read one's to the fact binnacle read of it — an authored fact included, and an adapter's problem said above the event;
- the Trajectory follows a live session: an event logged while it is open draws its line.

Ctrl+O opens it, Claude Code's key for its own detailed transcript; binnacle's Ctrl+T switches screens, so the two must differ. The same key, or Esc, returns to the transcript as it was. From the main screen, Ctrl+O switches to the fullscreen to open it, and closing returns to the main screen as it was.

While it is open, it answers the transcript's gestures ([Keys](keys.md)): a click on a line opens it to its record, Shift+Tab focuses a line and Enter opens it, and the wheel, search and selection are the fullscreen's own. The composer below stays live. What a person opened — a line's record, where focus was — is kept while the Trajectory stands, across opening and closing it.

## How it works

The Trajectory is a built-in plugin (`binnacle:packages/binnacle/src/plugins/trajectory/index.ts#apply`), placing its screen through the author API's `screen` registration (`binnacle:packages/binnacle/src/api.ts#Registrations`), drawn by the screen pane (`binnacle:packages/binnacle/src/panes/screen.ts#ScreenPane`) in the transcript's place. Its drawing (`binnacle:packages/binnacle/src/plugins/trajectory/draw.ts#drawTrajectory`) reads only the facts it is handed, never the events: what binnacle has read of an event is the fact, and what it has not is the record the fact carries, so no dsh shape is read here — the facts layer's is the only one. dsh web's Trajectory, a turn-aware ledger of every event (`dsh:packages/client/ui-trajectory/src/client/TrajectoryView.tsx`), is its model; its timeline, search and token counts are not taken.

A frame costs what changed, as the transcript's does: the screen is laid out again as events arrive or a fold opens, never the whole session at every frame.

## Choices

- The Trajectory is a row of binnacle's patch, `binnacle-trajectory`, so a person removes it by disabling that row in their profile's patch ([Authoring](authoring.md#removing-a-built-in-feature)).
- The key, Ctrl+O, and what it is called in help, a person's to change through the one key table ([Keys](keys.md)).
- One line per event, and what each line says: the kind first, then a few words — what a person sent, the tool a call asked for, which model answered, how a turn ended. The record beneath each line holds the rest.
- A read fact's line opens to the fact binnacle read of it — the adapter's own words — while a quiet or unknown one opens to the event as logged. The fact is the honest record of what binnacle knows; the event is the fallback's.
- The lines carry each event's place in the log, dim, so a person can find the event in the log file itself.
- Turn headings are chrome naming the group; the turn's own events are lines like any other.
- What the lines are grouped into a turn by: the log's turn boundaries, so an event between turns stays with the turn it followed.

## Open

- [#17](https://github.com/patrick-xin/binnacle/issues/17): the turn's own rhythm, drawn on the transcript, may change what a turn is called here.
