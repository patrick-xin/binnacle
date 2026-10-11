# Commands

Row `binnacle-commands` · Code `binnacle:packages/binnacle/src/plugins/commands/index.ts#apply` · Intent: [Authoring](../../intents/authoring/intent.md)

## What a person can do

- Type `/` in the composer, and see dsh's commands above it, in the registry's order, the first marked. Each is `/<name>`, with its description in the `muted` Tone.
- Type on, and see the offer narrow to the commands whose names match: the names that start with what is typed first, then the closest. While no command matches, the offer draws nothing.
- Move the mark with up and down while typing. They wrap. Page up and page down move the mark by a page, and stop at the first and the last command. With more than 8 commands, the offer shows 8, and keeps the mark in view.
- Pick a command with enter or a click. A command that takes no input runs at once. A command that takes input puts `/<name> ` in the draft, with the cursor at its end, for its input. Tab puts `/<name> ` in the draft, whichever the command.
- Close the offer with esc, and keep the draft. The offer opens again when the draft changes. With no offer, esc interrupts the turn, as before.
- See the offer close when the draft stops being `/` and a name. A space after the name, a new line, or the `/` taken out closes it.
- See a command that a plugin registers or removes while the offer is open show in it, or go from it, at once.
- On a stored session, or before the session opens, see nothing offered.
- Turn the row off, and see nothing offered, while a command typed in full still runs ([Composer](composer.md)).

## What an author can change

- Read the offer: the model `commands`, `binnacle.modelOf('commands')`, holds `open` and `query`, and its `items` are the commands that match, each `{ label, description, name, hint }`.
- What opening, closing, picking and completing do: set the action `commands.open`, `commands.close`, `commands.pick` or `commands.complete`. An empty `commands.open` takes the offer out.
- How a piece of a command is drawn: the Looks `commands.list.mark`, `commands.list.label` and `commands.list.description`, then `list.mark` and the rest, each given the item with its `hint`. So `commands.list.label` draws a command's hint after its name, and the row stays the List's own.
- How a whole command is drawn: the Look `commands.list.row`, then `list.row`. Its `beneath` is the row cut at the width.
- Where the offer is drawn: an edit of the Chat's `{ layout: 'commands' }` node, such as a move above the transcript. For a float, set the Layout `commands` to draw nothing, and draw `COMMANDS_LAYOUT`, from `binnacle/plugins/commands`, under another name.
- A command of their own: register it with dsh's `ctx.commands.register`, and it is offered and runs. Its handler can show a Screen with `binnacle.show`.

## How it is built

- **Running is the composer's, offering is this row's.** The default `composer.send` runs a command line. This row only changes the draft and runs `composer.send`. With the row off, every command still runs.
- **The model `commands`** is `{ open, query, items }`. `items` is a getter: at each read, it lists the registry's commands for the Chat's agent with `commands.list(agent)`, and filters them by name with `fuzzy`. So a command registered mid-session is offered with nothing to invalidate. With no agent, or no service `commands`, it is empty. dsh's `commands/change` draws the List again.
- **A command's row is cut.** The row sets the Look `commands.list.row` to its `beneath`, the List's default row, cut at the width with `more`. So a command draws in one line, and the offer's rows are its commands. Another List's default row wraps. A row Look of an author's over it is given the cut row as its `beneath`, and is not cut.
- **The draft drives the offer.** The row watches the model `composer`, and acts only when its `text` changes. A name has letters, digits, `_` and `-`, and can be empty. A draft that is `/` and a name runs `commands.open` if the offer is closed, and sets `query` to the name. A draft that stops being one runs `commands.close`.
- **The row acts only when the draft changes.** So an offer closed with esc stays closed until the person types. An offer that an author opens with no `/` in the draft stays open until it is closed. While the model `composer`'s `running` is `true`, the row closes the offer, and does not open it. So the offer changes no draft while a command runs.
- **The actions.** `commands.open` sets `open` and a `query` of `''`. `commands.close` clears `open`. `commands.pick` takes the marked item. With a `hint`, it sets the draft to `/<name> `. With none, it sets the draft to `/<name>` and runs `composer.send`. `commands.complete` sets the draft to `/<name> `.
- **Each action then closes the offer.** `commands.pick` and `commands.complete` run `commands.close`, so an author's own `commands.close` sees every close.
- **The keys of the actions.** Esc is `commands.close`'s, and tab is `commands.complete`'s. Each is `first` in `composer.input`, and enabled while the List draws a line. `commands.close` is also enabled while the row runs it. So an offer that matches no command, and draws nothing, closes too. `commands.pick` has no keys: the List runs it.
- **The Layout `commands`** is `COMMANDS_LAYOUT`: `{ place: 'commands.list', size: { most: 9 }, border: ['top'] }`, frozen and exported. The row inserts it in the Chat with `{ insert: { layout: 'commands', size: 'content', unless: 'request' }, before: 'composer' }`. So a Request that stands hides it with the composer. 9 cells hold 8 rows and the rule. While the offer is closed, or matches nothing, the List draws no line, and the Layout takes no row. An edit cannot remove a node that an insert added, so an author moves it, or sets the Layout `commands` to draw nothing.
- **The List `commands.list`** is the Kit's List. Its name is apart from the feature's, so its Model `{ mark }` and its actions do not hide the model `commands` and its actions. It has `keysIn: 'composer.input'`. Its items are the model's `items` while the offer is open, and none while it is closed. Its `key` is `query`, so the mark goes back to the first command as the query changes. Its `pick(index)` sets its mark to `index`, then runs `commands.pick`.
- **The List keeps its mark in view without the Focus**, as a `follow: 'least'` Place does ([Core](core.md)).
- **A command's own Screen.** A handler that calls `binnacle.show(screen)` shows the Screen, and the Handle's `dispose` goes back to the Chat. The row adds nothing for it.

## Built by

Spec [#287](https://github.com/patrick-xin/binnacle/issues/287) · Ticket [#290](https://github.com/patrick-xin/binnacle/issues/290): the offer, its model, its actions, its Layout and its List. · Ticket [#298](https://github.com/patrick-xin/binnacle/issues/298): a command's row in pieces, cut at the width.
