---
'binnacle': patch
---

An author sets actions that a person does with a key or a click, binds them, and changes what they do. `binnacle.action(id, action)` sets an action: it takes its `keys` in its `place`, before the Part with the Focus when it is `first`, and only while `enabled()` is true. `binnacle.bind(name, keys)` binds one action by its id, or every action of a `kind`, such as `list.toggle`. `binnacle.keysOf(id)` gives the keys of an action, to add one to them. `binnacle.run(id)` runs an action by its id, wherever the Focus is. An action set with the id of another is handed it as `beneath`, so two plugins that change one action both act. The package exports the type `Action`.
