# Transcript

A person reads the session as it happens, turn by turn:

- what they sent, after an accent `›`;
- what was added to the context without their typing it, as `⋯ added by` its source, folded away;
- the agent's answers, drawn as markdown, with its reasoning folded under a muted `∴ thinking` and drawn dim;
- each tool call, as [Tool cards](tool-cards.md) draws it when its tool presents it, and as its glyph and arguments otherwise: a muted `●` and `running…` while it runs; `●` in success once it returned, its result folded to three rows; `✗` in error, and why, when it failed;
- a kind of event binnacle does not draw, as `?` and its type, folded to its raw record.

A click on a fold opens it, and a click on an open one folds it again; so does Enter on the focused fold ([Keys](keys.md)). The wheel scrolls, and a drag selects.

## How it works

How a session reaches the screen is [the architecture's](../architecture.md#how-a-session-reaches-the-screen). binnacle's own drawing of each kind of entry is its built-in views (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`); each tool call whose tool presents it is drawn by the tool-cards plugin over them ([Tool cards](tool-cards.md)). A fold is laid out cut to its rows and offers `expand` (`binnacle:packages/binnacle/src/ui/layout.ts#layout`). A click, the wheel and a drag reach the gesture table through the pane (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`), and pi-tui windows, scrolls and selects the lines ([ADR 7](../adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).

## Choices

- How far each kind is folded: reasoning, context and whatever the fallback draws to nothing; a tool's output, and a result with no call, to three rows.
- A call and its result are drawn as one entry, the result under its call, and the glyph's tone says how the call stands.
- An answer's text is drawn as markdown, by pi-tui's `Markdown`; reasoning stays plain text.
- Titles are muted, and what went wrong is drawn in error.
- A kind no view draws is drawn by the fallback, never skipped ([ADR 4](../adr/0004-a-fact-is-one-event-and-what-dsh-folds-is-taken-from-dsh.md)).
- A call whose turn ends without its result says so — `the turn ended without it: aborted` — under its glyph, muted, on both cards and both screens; a late result answers the call and the line is gone.
