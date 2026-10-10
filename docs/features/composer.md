# Composer

Row `binnacle-composer` · Code `binnacle:packages/binnacle/src/plugins/composer/index.ts#apply` · Intent: [Authoring](../../intents/authoring/intent.md)

## What a person can do

- Type a draft in the Chat's composer, between two rules, with pi-tui's editor keys.
- Make a new line with shift+enter; a paste keeps its new lines.
- Send the draft as a prompt with enter, or steer the turn that runs. The draft goes into its history. A draft of whitespace sends nothing.
- Interrupt the turn that runs with esc.
- Clear the draft with ctrl+c. On an empty draft, ctrl+c pressed twice within half a second quits.
- On a stored session, enter keeps the draft, as nothing can be sent.
- See the draft again, as it was, once no Request stands.

## What an author can change

- Read and set the draft: the model `composer`, `binnacle.modelOf('composer')`. Its state's `text` is the draft as it would be sent, a large paste's content in full. Setting it to another draft replaces the one shown.
- The keys that send and make a new line: `binnacle.bind('composer.send', …)` and `binnacle.bind('composer.newline', …)`, such as ctrl+s to send and enter for a new line.
- What sending does: set an action `composer.send`, and run `beneath()` to keep the default, or leave it out, such as to queue the draft while the agent runs.
- What ctrl+c does on a draft: the composer's `binnacle.clear`, which an author binds or changes as any action.
- What is drawn beside the draft: an edit of the Layout `composer`, a row with the Place `composer.input`.
- Where the composer is in the Chat: an edit of the Chat's `{ layout: 'composer' }` node.
- Replace the composer: turn off its row, and set the Layout `composer`, or place a Part in `composer.input`.
- Take a key from the composer with an action of their own with no Place, or add a key to a core gesture with `binnacle.bind`, such as ctrl+x to `binnacle.interrupt`.

## How it is built

- **The copied editor.** The composer is pi-tui's editor, copied under `packages/binnacle/src/terminal/components/`, and it stays until a person or an author needs something it cannot do. It keeps the cursor, the history and the paste markers.
- **The Layout `composer`**, `{ row: [{ place: 'composer.input', size: 'fill' }] }`, which the Chat draws with `{ layout: 'composer', size: 'content', unless: 'request' }`. The editor fills `composer.input`, where the Chat's Focus starts, and still draws its own rules. Turned off, the row leaves no composer, as the Layout `composer` is not set.
- **The model `composer`**, `{ text }`. The editor's `onChange` sets `text` to its expanded text, the paste markers' content in full. When `text` differs from the editor's expanded text, as when an author sets it, the composer calls the editor's `setText`, which drops the markers and puts the cursor at the end. The editor's own changes never differ, so they never call `setText`.
- **Submit and new line are actions** of `composer.input`: `composer.send` takes the keys of the Gesture Table's `tui.input.submit`, enter, and `composer.newline` those of `tui.input.newLine`, shift+enter and ctrl+j. The composer gives the editor no key that matches either, so the editor sends nothing and makes no new line by itself.
- **The sequences for shift+enter that name no key**, which pi-tui's editor takes as a new line by its fallbacks, run `composer.newline` while no action other than the editor's is bound to them. So does alt+enter's sequence, which some terminals send for shift+enter. A key bound to both actions runs `composer.newline`, as the editor made a new line before it submitted: ctrl+j's sequence is also enter's. pi's fallback for macOS's Terminal and for Windows reads the shift key through a native helper, and binnacle does not copy it: there, ctrl+j or a backslash before enter is a new line.
- **The default `composer.send`** keeps the draft while the Chat's session has no agent: a stored session, or one not open yet. With a backslash before the cursor, it takes it out and runs `composer.newline`, wherever `composer.send` is bound. A draft that is only whitespace sends nothing. Otherwise it sends the draft, trimmed, or steers the turn that runs, adds it to the history, and clears it.
- **Ctrl+c is the core's `binnacle.clear`.** The composer sets an action by that id in `composer.input`, enabled while the draft has text, which clears it. On an empty draft, the core's takes the key, and quits on a second press within half a second.
- **Esc interrupts**: it is the core's `binnacle.interrupt`; a steer that was queued runs after the interrupt, as in dsh. Ctrl+z suspends.
- **Its other keys come from the Gesture Table**, as the editor reads them there.
- **It passes on each key that another action is bound to.** It takes a key only when `binnacle.gestures.actionsOf` names no action but the editor's `tui.` ones, submit and new line left out. So escape goes on to the core's interrupt, and a key that an author binds to an action with no Place, or to a core gesture, reaches that action.
- **It shows at most 24 rows** of a long draft.

## Built by

Stage 2 (before Specs). PR [#153](https://github.com/patrick-xin/binnacle/pull/153): esc interrupts, ctrl+c clears and quits · Spec [#224](https://github.com/patrick-xin/binnacle/issues/224) · Ticket [#230](https://github.com/patrick-xin/binnacle/issues/230): it passes on an author's keys · Spec [#236](https://github.com/patrick-xin/binnacle/issues/236) · Ticket [#237](https://github.com/patrick-xin/binnacle/issues/237): the draft as a model, its actions, and the Layout `composer`.
