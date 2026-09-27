# Transcript

A person reads the session as it happens, turn by turn:

- what they sent, after `›`;
- what was added to the context without their typing it, as `⋯ added by` its source, folded away;
- the agent's answers, with its reasoning folded under `∴ thinking`;
- each tool call, `●` and its arguments, reading `running…` until its result, which is folded to three rows; `✗` and why, when it failed;
- a kind of event binnacle does not draw, as `?` and its type, folded to its raw record.

A click on a fold opens it, and a click on an open one folds it again. The wheel scrolls, and a drag selects.

## How it works

How a session reaches the screen is [the architecture's](../architecture.md#how-a-session-reaches-the-screen). binnacle's own drawing of each kind of entry is its built-in views (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`). A fold is laid out cut to its rows and offers `expand` (`binnacle:packages/binnacle/src/ui/layout.ts#layout`). A click, the wheel and a drag reach the gesture table through the pane (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`), and pi-tui windows, scrolls and selects the lines ([ADR 7](../adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).

## Choices

- How far each kind is folded: reasoning, context and whatever the fallback draws to nothing; a tool's output, and a result with no call, to three rows.
- A call and its result are drawn as one entry, the result under its call.
- A kind no view draws is drawn by the fallback, never skipped ([ADR 4](../adr/0004-a-fact-is-one-event-and-what-dsh-folds-is-taken-from-dsh.md)).
