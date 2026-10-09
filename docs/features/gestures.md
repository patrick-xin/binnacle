# Gestures

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/core/gestures.ts#gestureTable`, `binnacle:packages/binnacle/src/core/actions.ts#Actions` · Intent: none yet

## What a person can do

- Use the keyboard and the mouse through one Gesture Table: each action has an id, its default keys and a description.
- Move the Focus to the next Place that takes keys with shift+tab, or with a click on a Place that takes keys: one whose Part takes keys, or that an action acts in. A Screen shown over another has its own Focus, and the one under it gets its Focus back.
- Click a Part: the click reaches the Part under the pointer, with or without the Focus. Only the left button clicks.
- Scroll with the wheel.

## What an author can change

- Read the Gesture Table: `binnacle.gestures.actionsOf(gesture)` gives the actions a key or a mouse gesture is bound to.
- Make a Part take keys, clicks and the Focus: `Part.key`, `Part.click` and `Part.focus`, in `binnacle:packages/binnacle/src/api.ts#Part`.
- Set an action with `binnacle.action(id, action)`: its `run(at, beneath)`, its `keys`, its `place`, `first`, its `kind`, `enabled()` and its `description`, in `binnacle:packages/binnacle/src/api.ts#Action`. The newest enabled action by an id takes its gestures, and it goes when the plugin that set it unloads.
- Mark an action of a Place `first`, so that it takes its key before the Part with the Focus, such as tab while a line is being typed.
- Turn an action off for a moment with `enabled()`: while it returns false, the action is as if it were not set.
- Bind an action by its id, or every action of a kind, such as `list.toggle`, with `binnacle.bind(name, keys)`. A binding by id wins over its kind's.
- Add a key to an action without repeating its others: `binnacle.bind(id, [...binnacle.keysOf(id), 'ctrl+n'])`. `keysOf(id)` reads the newest action by the id, enabled or not: an author reads it once at load, while `enabled()` changes as the session runs, and an action that names its own keys owns its id's keys.
- Run an action by its id with `binnacle.run(id)`, wherever the Focus is.
- Change what an action does: set an action by its id, and run the one it hides with `beneath()`. Two plugins that each change one action both act, the newest first.
- Move the Focus to a Place by its name with `binnacle.focus(place)`, or to a Part's own Place with the `focus()` of the Handle that `binnacle.place` returns.
- Scroll a Place by pages with `binnacle.scroll(place, pages)`: toward its last line when `pages` is positive, as page down does, and toward its first when it is negative.

A person cannot rebind a key yet.

## How it is built

- **The Gesture Table** holds pi-tui's editor actions and the core's own: `binnacle.clear` (ctrl+c), `binnacle.interrupt` (escape), `binnacle.suspend` (ctrl+z), `binnacle.focus.next` (shift+tab), `binnacle.scroll.up` and `binnacle.scroll.down` (the wheel). The copied editor reads its keys from it.
- **The order a key goes in** (`binnacle:packages/binnacle/src/core/input.ts#route`):
  1. The actions marked `first` of the Place with the Focus.
  2. The Part with the Focus.
  3. The other actions of the Place with the Focus.
  4. The actions with no Place. `first` puts no action with no Place before the Part.
  5. The Gesture Table, where the core does the core's action bound to the key.
- **A click goes to the Part under the pointer**, then to the actions of its Place bound to the click's gesture, such as `click` or `shift+click`, with the cell clicked in the Part's lines, then to the Gesture Table. A click below the Part's lines, or on the Place's box, gives an action no cell.
- **The actions of an id are a stack.** The newest enabled one takes the id's gestures, and the others are beneath it. An action that names no `keys`, or no `kind`, keeps those of the action it hides, so a plugin that changes what an action does need not repeat its keys.
- **Two actions in one step:** when two enabled actions with different ids take a gesture in one step, the one set last wins. All the actions are held in one list, oldest first, for this.
- **The keys of an action** are the newest binding by its id, else the newest by its kind, else its own `keys`. `[]` unbinds it.
- **`beneath()` is found when it runs, never captured**, as a Look's is: the newest enabled action by the id beneath this one, with the same `at`, or nothing. It skips an action whose `enabled()` is false. `binnacle.run(id)` and `beneath()` check `enabled()` and nothing else, neither the Focus nor the Place, as a call is not a gesture. A `beneath()` whose own action has gone does nothing.
- **A Place takes the Focus** while its Part takes keys, or while an action is set that acts in it, enabled or not, so that the Focus stays while an action is disabled for a moment.
- **The mouse is on by default**, as in pi.
- **The Focus belongs to a Place**, so it stays when the Place's Part is replaced. A Screen names where it starts.
- **A Focus moved waits for its Place.** A click, shift+tab, `binnacle.focus(place)` and a Handle's `focus()` each move it, and the core keeps whether its Place has had it yet. A Place that does not draw yet, or does not take keys yet, takes the Focus once it does. The core forgets the Focus moved only after its Place has had it and stopped taking keys.
- **A scroll by pages** (`binnacle:packages/binnacle/src/core/drawing.ts#Drawing`) reads where the Place was last drawn: a page is the rows of the Place's box, inside its borders and padding, and it starts from the rows the Place showed, which the cursor of the Part with the Focus can move. The next draw stops it at the first line, as it stops the wheel. A Place that was not drawn, or that has no rows of room, does not scroll, and the Focus does not move. A page of the Place with the Focus wins over its Part's cursor until the cursor moves ([Core](core.md)).

## Built by

Stage 2 (before Specs) · Spec [#156](https://github.com/patrick-xin/binnacle/issues/156) · PR [#167](https://github.com/patrick-xin/binnacle/pull/167) · Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#189](https://github.com/patrick-xin/binnacle/issues/189): actions, bindings, run by id, and the action beneath · Ticket [#190](https://github.com/patrick-xin/binnacle/issues/190): the Focus and the scroll by a Place's name.
