# Tool cards

Row `binnacle-tool-cards` · Code `binnacle:packages/binnacle/src/plugins/tool-cards/index.ts#apply` · Intent: [Authoring](../../intents/authoring/intent.md)

## What a person can do

- See each tool call and its result as one card, where the call is in the transcript, with the row `binnacle-tool-cards` on, as binnacle ships it: its first line, its body, then a blank line.
- Read on a card's first line `⏺ ` and the tool's title, cut at the width. The title is the one that dsh's view of the call gives, or the tool's name. The `⏺` is in the `accent` Tone while the call runs, `success` when it is done, and `error` when it failed. A shell command that ended with an exit code other than 0, or with a signal, failed. A card that is done ends its first line with how long the call took, in the `muted` Tone: ` · 1.2s` under a minute, ` · 1:15` after.
- Read a card's body, each line after `  ⎿ ` for the first and `    ` for the rest, as the result's card kind says:
  - a shell command's last 12 lines of output, after `… <n> earlier lines` when there are more, and `exit <code>` or `signal <name>` in the `error` Tone when it did not exit with 0;
  - a diff's line for each file, `<path> +<added> -<removed>`, the counts in the `success` and `error` Tones;
  - a search's `<n> matches` or `<n> paths`, and ` (truncated)` in the `warning` Tone when dsh cut it;
  - a read's `<n> lines of <total>`;
  - a web retrieval's title, then the first 12 lines of its text;
  - a todo list's items, one a line: `[x]` and the item in the `muted` Tone when it is completed, `[ ]` and the item in `accent` when it is in progress, `[ ]` and the item when it is pending;
  - a question's text, then `→ ` and its answer once it came: the choices selected, then the person's own text, joined by `, `;
  - any other tool's title, when its view has one, then the first 12 lines of its text, or, when its text is JSON, a line for each key, `key: value`.
- While a call runs, read what it does: a shell command's description and working directory, a diff's line for each file, or the call's input, a line for each key, `key: value`. A card with no body draws its first line alone.
- Fold a card's body with enter on the Marked card, or with a click on its first line. A todo card and an ask card do not fold: a click on them only Marks them. The card then draws its first line alone, which ends with `(1 line)` or `(<n> lines)`. Again, and it unfolds. The Mark moves between cards as between events.
- Read a stored session's cards the same way, with the times the calls took. A call that never got a result draws no time.
- Watch the call that streams as the view draws it, `⏺ <tool>(<the arguments so far>)`. Its card takes its place once it commits.
- Turn the row `binnacle-tool-cards` off, and read a call and its result as two lines again, as [Transcript](transcript.md) draws them.

## What an author can change

- A whole card: the Look `transcript.card`, a `CardLook` from `binnacle/plugins/tool-cards`, given the `Card` and `{ width, isFolded }`. A `Card` holds these fields:
  - `seq` and `name`: the call's seq and the tool's name.
  - `args`: the arguments, parsed, or the raw string when they are not JSON.
  - `call`: dsh's view of the call.
  - `result`: `{ view, text, failed }`, once the result came. `failed` is dsh's `isError`, or a terminal view's exit code other than 0, or its signal.
  - `startedAt` and `endedAt`: the times, in epoch milliseconds.

  Such as a card in a box, drawn with `frame` from `binnacle`.
- A piece of every card, each with a Look of its own:
  - `transcript.card.title` is given the card and the width beside the time. It returns the first line's text without the time.
  - `transcript.card.mark` is given the card. It returns the painted `⏺`, which the default title draws before the title.
  - `transcript.card.time` is given the card. It returns the time's text, or `''` for none.

  Such as no card that shows a time, or a running time counted from the model `clock`.
- How many lines a body shows: `transcript.card.most` is given the card, and returns a number, 12 by default. The terminal, web, generic and no-view bodies show at most that many lines. A terminal's `… <n> earlier lines` counts the lines that it leaves out. Such as a shell command's last 3 lines, not 12.
- One card kind's body: `transcript.card.<kind>`, such as `transcript.card.terminal`, given the card and the body's width, returns the body's lines without the `⎿` prefix.
- One tool's body: `transcript.tool.<name>`, such as `transcript.tool.grep`, which lies on its card kind's Look.
- What folds a card: the card's first line is `{ text, fold: '<seq>/body' }`, so a `transcript.card` that marks another line, or none, moves or takes out the trigger ([Transcript](transcript.md)).

## How it is built

- **A row of its own**, as the view lies on the raw transcript. `binnacle-tool-cards` lays its Looks over the view's: on `transcript.event.tool/call`, to draw the card, and on `transcript.event.tool/result`, to draw nothing when its call is in the session's events, and `beneath` when it is not. It loads after `binnacle-transcript-view` in the bundle's patch, so that its Looks are the newer of the two built-ins'.
- **The card's data.** The row finds a call's result by its `callId`, as the result's `message.toolCallId`, in the model `transcript`'s `events`. It indexes the events once, and then only the events that came since, as they only grow until an author replaces them. It asks dsh's tools service, `ctx.tools.get(name, agent)`, for the tool, with the Chat's agent, or with none on a stored session, and gets the views from the tool's `presentCall(args)` and `presentResult(args, { content, isError, meta })`. A presenter that throws, a tool the service does not know, and arguments that are not JSON give no view. A view is kept for its event while the tool is the same, as a presenter is pure. `startedAt` and `endedAt` are the call's and the result's events' `time`.
- **The body's kind** is the result view's `card` once the result came, else the call view's, else `generic`. So the result chooses, whatever the call's was. The body draws through `transcript.tool.<name>`, beneath it `transcript.card.<kind>`, and at the end the kind's default.
- **The kinds' defaults** make each text plain and cut each line at the body's width. The `generic` default draws a result's title and its content's text blocks, else the result's text, so a result with no view draws its text. While a call runs, it draws the call view's `rawInput`, or the arguments when there is no call view. A JSON value draws as dsh's web app draws it: an object as a line for each key, `key: value`, and a list as a line for each item, at most `transcript.card.most` lines. A value on such a line is text as it is, a list of such values joined by `, `, and anything deeper as compact JSON. Each number draws as it was written, read with `JSON.parse`'s source text, as parsing can change its digits. A result's text that is a JSON object or list draws so too. Arguments that are not JSON draw as written, on one line. A kind's default given a view of another kind draws as `generic`.
- **A diff's counts** compare the lines of `oldText` and `newText`, split at each line break with a last empty line dropped: `added` counts the new lines that are not among the old, `removed` the old lines that are not among the new. A `null` `oldText`, a new file, counts every new line added. Two diffs of one path are two lines.
- **The fold** is of the body's region, `'<seq>/body'`, on the card's first line. Folded, the card draws its first line alone, ending with `(1 line)` or `(<n> lines)`. The count is of the body's lines before the core wraps them. A card with no body has nothing to fold: its first line is `{ text }`, a Line that folds nothing, so a click on it only Marks it.
- **Two of dsh's tools have a body of their own.** `transcript.tool.todo_write` draws the list from the arguments, as dsh's `todo_write` takes the whole list each time, while it runs and once it is done. Its boxes are the theme's `checked` and `unchecked` glyphs. `transcript.tool.ask_user_question` draws no body while the call waits, as the Request shows its questions. Once the result came, it draws each question from the arguments, and each answer from its JSON, `{ answers: [{ id, selected, custom }] }`, by the question's `id`. A failed call, or a result that is not that JSON, draws as `generic` does. Both cards are read whole: their first line is `{ text }`, a Line that folds nothing.
- **A shell's failure.** A result failed when dsh's `isError` is true. It also failed when its view is `terminal` with a `signal`, or with an `exitCode` other than 0. dsh's shell gives `isError` false for a command that exits 1.
- **The dot and the budget are Looks.** The default title draws `transcript.card.mark` before the title, cut to the width left after the dot. The terminal, web, generic and no-view bodies read `transcript.card.most` each time they draw. The diff, search and read bodies do not read it.
- **The default reads no clock**, so nothing ticks while no author asks for a running time.
- **The call that streams** stays the view's `transcript.live`, and approvals stay the Requests'.

## Built by

Spec [#269](https://github.com/patrick-xin/binnacle/issues/269) · Ticket [#274](https://github.com/patrick-xin/binnacle/issues/274): each call and its result as one card, from dsh's views. Ticket [#283](https://github.com/patrick-xin/binnacle/issues/283): the card's dot and line budget as Looks, and a shell's non-zero exit as a failed call.
