---
'binnacle': patch
---

An author makes a Model with `createModel(state)`: its `state`, `set(change)` and `watch(changed)`. Its watchers learn of a change in a microtask after it is made, once for the changes made together, and never while it is made. A Part that lists its Models in `models` is drawn again after each of them changes, with no code of the author's. `binnacle.model(name, model)` names a Model, and `binnacle.modelOf(name)` finds it. The package exports `createModel`, and the types `Model` and `Watchable`.
