# Gestures

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/core/gestures.ts#gestureTable` · Intent: none yet

## What a person can do

- Use the keyboard and the mouse through one Gesture Table: each action has an id, its default keys and a description.
- Move the Focus to the next Place that takes keys with shift+tab, or with a click on a Place whose Part takes keys. A Screen shown over another has its own Focus, and the one under it gets its Focus back.
- Click a Part: the click reaches the Part under the pointer, with or without the Focus. Only the left button clicks.
- Scroll with the wheel.

## What an author can change

- Read the Gesture Table: `binnacle.gestures.actionsOf(gesture)` gives the actions a key or a mouse gesture is bound to.
- Make a Part take keys, clicks and the Focus: `Part.key`, `Part.click` and `Part.focus`, in `binnacle:packages/binnacle/src/api.ts#Part`.

Neither a person nor an author can rebind a key yet, or add an action.

## How it is built

- **The Gesture Table** holds pi-tui's editor actions and the core's own: `binnacle.clear` (ctrl+c), `binnacle.interrupt` (escape), `binnacle.suspend` (ctrl+z), `binnacle.focus.next` (shift+tab), `binnacle.scroll.up` and `binnacle.scroll.down` (the wheel). The copied editor reads its keys from it.
- **A key goes to the Part with the Focus first**, then to the Gesture Table, and the core does the core's action bound to it: `binnacle:packages/binnacle/src/core/input.ts#route`. A click goes to the Part under the pointer first.
- **The mouse is on by default**, as in pi.
- **The Focus belongs to a Place**, so it stays when the Place's Part is replaced. A Screen names where it starts.

## Built by

Stage 2 (before Specs) · Spec [#156](https://github.com/patrick-xin/binnacle/issues/156) · PR [#167](https://github.com/patrick-xin/binnacle/pull/167).
