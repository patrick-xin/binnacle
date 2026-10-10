# Gestures

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/core/gestures.ts#gestureTable`, `binnacle:packages/binnacle/src/core/actions.ts#Actions` · Intent: none yet

## What a person can do

- Use the keyboard and the mouse through actions: each action has an id, its default keys and a description. The editor's keys are in the Gesture Table, and the core's own gestures are actions, as an author's are, and as the composer's submit and new line are.
- Move the Focus to the next Place that takes keys with shift+tab, or with a click on a Place that takes keys: one whose Part takes keys, or that an action acts in. A Screen shown over another has its own Focus, and the one under it gets its Focus back.
- Click a Part: the click reaches the Part under the pointer, with or without the Focus. Only the left button clicks.
- Scroll with the wheel.

## What an author can change

- Read what a key is bound to now: `binnacle.gestures.actionsOf(gesture)` gives the editor's actions of the Gesture Table, and each enabled action, the core's or one an author or a built-in set, that acts wherever the Focus is or in the Place with the Focus. So a Part that passes on the keys of other actions, as the composer does, passes on an author's key.
- Make a Part take keys, clicks and the Focus: `Part.key`, `Part.click` and `Part.focus`, in `binnacle:packages/binnacle/src/api.ts#Part`.
- Set an action with `binnacle.action(id, action)`: its `run(at, beneath)`, its `keys`, its `place`, `first`, its `kind`, `enabled()` and its `description`, in `binnacle:packages/binnacle/src/api.ts#Action`. The newest enabled action by an id takes its gestures, and it goes when the plugin that set it unloads.
- Mark an action of a Place `first`, so that it takes its key before the Part with the Focus, such as tab while a line is being typed.
- Turn an action off for a moment with `enabled()`: while it returns false, the action is as if it were not set.
- Bind an action by its id, or every action of a kind, such as `list.toggle`, with `binnacle.bind(name, keys)`. A binding is a list of keys, which replaces the keys beneath it, or a function of them. A binding by id is given, or replaces, what its kind's gives.
- Add a key to an action without repeating its others, whichever plugin loads first: `binnacle.bind(id, (keys) => [...keys, 'ctrl+n'])`.
- Bind the core's own gestures by their ids, as any action: `binnacle.bind('binnacle.interrupt', (keys) => [...keys, 'ctrl+x'])` makes ctrl+x interrupt the turn, from the composer too.
- Read the keys an action is bound to now with `binnacle.keysOf(id)`. It reads the newest action by the id, enabled or not, as `enabled()` changes as the session runs, and an action that names its own keys owns its id's keys.
- Run an action by its id with `binnacle.run(id)`, wherever the Focus is.
- Change what an action does: set an action by its id, and run the one it hides with `beneath()`. Two plugins that each change one action both act, the newest first.
- Move the Focus to a Place by its name with `binnacle.focus(place)`, or to a Part's own Place with the `focus()` of the Handle that `binnacle.place` returns.
- Scroll a Place by pages with `binnacle.scroll(place, pages)`: toward its last line when `pages` is positive, as page down does, and toward its first when it is negative.

A person cannot rebind a key yet.

## How it is built

- **The Gesture Table** holds pi-tui's editor actions, the `tui.` ids. The copied editor reads its keys from it, but for submit and new line: `tui.input.submit` and `tui.input.newLine` give their keys to the composer's actions `composer.send` and `composer.newline`, and the composer gives the editor no key that they match ([Composer](composer.md)).
- **The core's gestures are actions** that the core sets at its start, with no Place, ranked as a built-in's beneath an author's (`binnacle:packages/binnacle/src/core/actions.ts#coreActions`): `binnacle.clear` (ctrl+c), `binnacle.interrupt` (escape), `binnacle.suspend` (ctrl+z), `binnacle.focus.next` (shift+tab), `binnacle.scroll.up` and `binnacle.scroll.down` (the wheel). So `bind`, `keysOf`, `run` and `beneath()` reach them as they reach an author's. The wheel's scroll reads the cell under the pointer from the core, as an action's `at` is a cell in a Part's lines.
- **`actionsOf`** gives the Gesture Table's actions that match the gesture, then the newest enabled action of each id whose keys match, if it has no Place or acts in the Place with the Focus. An action of another Place is left out, so a list's space does not keep the composer from typing a space.
- **The order a key goes in** (`binnacle:packages/binnacle/src/core/input.ts#route`):
  1. The actions marked `first` of the Place with the Focus.
  2. The Part with the Focus.
  3. The other actions of the Place with the Focus.
  4. The actions with no Place, the core's among them. `first` puts no action with no Place before the Part.
- **A click goes to the Part under the pointer**, then to the actions of its Place bound to the click's gesture, such as `click` or `shift+click`, with the cell clicked in the Part's lines. A notch of the wheel goes to the actions with no Place. A click below the Part's lines, or on the Place's box, gives an action no cell.
- **The actions of an id are a stack.** The newest enabled one takes the id's gestures, and the others are beneath it. An action that names no `keys`, or no `kind`, keeps those of the action it hides, so a plugin that changes what an action does need not repeat its keys. An action that names no `place` keeps the `place` and the `first` of the action it hides. So an action set by the id of a Place's action takes a gesture only in that Place. An action that names its own `place` acts there. To act from every Place, an author sets an action of a new id.
- **Two actions in one step:** when two enabled actions with different ids take a gesture in one step, the one set last wins. All the actions are held in one list, oldest first, for this.
- **The keys of an action** are its own `keys`, then each binding by its kind, then each binding by its id, oldest first (`binnacle:packages/binnacle/src/core/actions.ts#Actions`). A binding to a list replaces the keys beneath it, and `[]` unbinds. A binding that is a function is given the keys beneath it, and the core calls it each time it resolves a gesture, so it adds to the keys of an action set after it. Two such bindings by one name both apply, the newest given what the one beneath gives.
- **`beneath()` is found when it runs, never captured**, as a Look's is: the newest enabled action by the id beneath this one, with the same `at`, or nothing. It skips an action whose `enabled()` is false. `binnacle.run(id)` and `beneath()` check `enabled()` and nothing else, neither the Focus nor the Place, as a call is not a gesture. A `beneath()` whose own action has gone does nothing.
- **A Place takes the Focus** while its Part takes keys, or while an action is set that acts in it, enabled or not, so that the Focus stays while an action is disabled for a moment.
- **The mouse is on by default**, as in pi.
- **The Focus belongs to a Place**, so it stays when the Place's Part is replaced. A Screen names where it starts.
- **A Focus moved waits for its Place.** A click, shift+tab, `binnacle.focus(place)` and a Handle's `focus()` each move it, and the core keeps whether its Place has had it yet. A Place that does not draw yet, or does not take keys yet, takes the Focus once it does. The core forgets the Focus moved only after its Place has had it and stopped taking keys.
- **A scroll by pages** (`binnacle:packages/binnacle/src/core/drawing.ts#Drawing`) reads where the Place was last drawn: a page is the rows of the Place's box, inside its borders and padding, and it starts from the rows the Place showed, which the cursor of the Part with the Focus can move. The next draw stops it at the first line, as it stops the wheel. A Place that was not drawn, or that has no rows of room, does not scroll, and the Focus does not move. A page of the Place with the Focus wins over its Part's cursor until the cursor moves ([Core](core.md)).

## Built by

Stage 2 (before Specs) · Spec [#156](https://github.com/patrick-xin/binnacle/issues/156) · PR [#167](https://github.com/patrick-xin/binnacle/pull/167) · Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#189](https://github.com/patrick-xin/binnacle/issues/189): actions, bindings, run by id, and the action beneath · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): the Focus and the scroll by a Place's name · Spec [#184](https://github.com/patrick-xin/binnacle/issues/184) · Ticket [#222](https://github.com/patrick-xin/binnacle/issues/222): a binding that is a function of the keys beneath it · Spec [#224](https://github.com/patrick-xin/binnacle/issues/224) · Ticket [#230](https://github.com/patrick-xin/binnacle/issues/230): one table for keys, the core's gestures as actions · Spec [#236](https://github.com/patrick-xin/binnacle/issues/236) · Ticket [#237](https://github.com/patrick-xin/binnacle/issues/237): submit and new line leave the editor, as the composer's actions.
