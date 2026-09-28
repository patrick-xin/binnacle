# Transcript

A person reads the session as it happens, turn by turn:

- what they sent, heading its turn in a band — padded, and filled with the theme's background — after the `prompt` mark ([Theme](theme.md));
- context that changes the tools — what the harness added or took away without the person typing it — after the `context` mark, as `added by` its source: one line, saying how much it holds, opening there;
- the agent's answers, drawn as markdown, with its reasoning drawn dim beneath one muted `thinking` line that says how much it holds and opens there; a call an answer made draws as its own entry, never as a line inside it;
- each tool call, as [Tool cards](tool-cards.md) draws it when its tool presents it, and as its mark and arguments otherwise ([Theme](theme.md)): the `running` mark and `running…` while it runs; `done` once it returned, its result folded beneath; `failed`, and why, when it failed;
- a kind of event binnacle has not learned to draw, as the `unknown` mark and its type: one line, its raw record folded on it.

The session's machinery draws no line at all. The transcript is the conversation: what the person asked, what the model said and did. Everything the session logged stays one key away, on the [Trajectory](trajectory.md).

A click on a fold opens it, and a click on an open one folds it again — a fold of no rows on its title line alone, its content offering nothing; so does Enter on the focused fold ([Keys](keys.md)). The wheel scrolls, and a drag selects.

## How it works

How a session reaches the screen is [the package map's](../../packages/binnacle/README.md#how-a-session-reaches-the-screen). Every kind of event dsh knows is named in one table in the facts layer, as *read* (a fact the transcript draws), *quiet* (a fact it draws as nothing) or *unread* (left to the fallback on purpose until a feature draws it) (`binnacle:packages/binnacle/src/facts/kinds.ts#kinds`); a test walks dsh's own set, so a release that adds a kind fails it, naming the kind. What is quiet is what dsh web's Chat shows no row for (`dsh:packages/client/ui-chat/src/client/contract/chat-visibility.ts#isVisibleChatNode`): a `user/message` whose source is not the person is quiet, unless it adds or removes tools, which is the one context row Chat keeps. binnacle's own drawing of each kind of entry is its built-in views (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`); each tool call whose tool presents it is drawn by the tool-cards plugin over them ([Tool cards](tool-cards.md)). One blank line separates two entries that draw something, whichever turns they sit in, and an entry that draws nothing takes none (`binnacle:packages/binnacle/src/views/screen.ts#screens`); a turn's gap falls before its prompt, the first entry it drew. A fold is laid out cut to its rows and offers `expand` (`binnacle:packages/binnacle/src/ui/layout.ts#layout`); one that shows no rows names the line it folds under and its marker rides it — `∴ thinking · 5 lines` — so the fold costs that line alone, and open it answers on that line alone, the title saying it can be folded. A click, the wheel and a drag reach the gesture table through the pane (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`), and pi-tui windows, scrolls and selects the lines ([ADR 7](../adr/0007-pi-tui-windows-scrolls-and-selects-the-transcript.md)).

The transcript is placed in its slot through the same registration an author uses, by the built-in Transcript plugin (`binnacle:packages/binnacle/src/plugins/transcript/index.ts#transcript`), and the host lays out what is placed: on the alternate screen the transcript's place grows to fill what the rest leave, and what is placed around the composer sits under it at its height ([Authoring](authoring.md)). A drawing of an author's own takes the transcript's place as a placed screen does; the [Trajectory](trajectory.md) is one.

## Choices

- How far each kind is folded is [Theme](theme.md)'s — how many rows each shows, and whether it starts open — a person's to change by asking; the starts binnacle ships are named there.
- A prompt heads its turn in a band: one column each side, one line above and below, filled with the theme's background for what the person sent ([Theme](theme.md)); the padding is pi's, for its user message is padded the same way (`pi:packages/coding-agent/src/modes/interactive/components/user-message.ts#UserMessageComponent`). This is a default, an author's to change: a view registered for `prompt` draws it otherwise.
- One blank line separates two entries that draw something, and an entry that draws nothing takes none, so a turn's gap falls before its prompt; a person who wants their session denser asks an author for a view that draws the rhythm otherwise.
- A call and its result are drawn as one entry, the result under its call, and the mark says how the call stands ([Theme](theme.md)).
- An answer's text is drawn as markdown, by pi-tui's `Markdown`; reasoning stays plain text.
- An answer draws no line for a call it made: every call an answer keeps is also logged as a call of its own, so it is its tool entry's to draw ([Tool cards](tool-cards.md) when its tool presents it).
- Which kinds are quiet is the kinds table's, and it is this page's default, a person's to change: a view registered for a quiet kind, by its dsh type, draws it again ([Authoring](authoring.md)). A kind named unread keeps its fallback line until a feature draws it.
- Titles are muted, and what went wrong is drawn in error.
- A kind no view draws is drawn by the fallback, never skipped ([ADR 4](../adr/0004-a-fact-is-one-event-and-what-dsh-folds-is-taken-from-dsh.md)) — a kind dsh does not know included, which is how a plugin outside dsh's log reaches the screen.
- A control sequence in what was logged — one that would clear the screen, write the clipboard, set the title or colour the text — never acts on the terminal: it is drawn as its text, and any other control character as a symbol a person can read ([ADR 14](../adr/0014-no-text-a-node-carries-reaches-the-terminal-as-a-control.md)).
- A call whose turn ends without its result says so — `the turn ended without it: aborted` — under its mark, muted, on both cards and both screens; a late result answers the call and the line is gone.
