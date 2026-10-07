---
'binnacle': minor
---

A person clicks a Part, and moves the Focus by shift+tab or a click, through one Gesture Table. `Binnacle.keys` becomes `Binnacle.gestures`, `Keys.actionsOf(key)` becomes `Gestures.actionsOf(gesture)` with mouse gestures named `click`, `wheelup` and `wheeldown` (each with `shift+`, `alt+` and `ctrl+` before it), the type `Cursor` is renamed `Point`, and a `Part` gains `click?(at: Point): boolean` and `focus?(has: boolean): void`. The Focus is held per Screen shown: a Screen's `focus` is where it starts, a person moves it by a click on a Place whose Part takes keys or by shift+tab (`binnacle.focus.next`), and when its Place stops taking keys the Focus falls back to the Screen's own, then to the first Place in the layout that takes keys. The wheel is bound in the table as `binnacle.scroll.up` and `binnacle.scroll.down`.
