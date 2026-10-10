---
'binnacle': minor
---

`binnacle.modelOf(name)` gives a Model that stands for the newest Model by that name. It is found each time it is read, set or watched. So a plugin that finds it in `apply` works whichever plugin names it first. It no longer gives `undefined`: while none is named, its `state` is `undefined`, `set` does nothing, and a watcher waits for one.
