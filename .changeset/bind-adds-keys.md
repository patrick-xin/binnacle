---
'binnacle': patch
---

`binnacle.bind(name, keys)` also takes a function of the keys beneath the binding, read each time a gesture is resolved, so an author adds a key whichever plugin loads first: `bind('request.choices.down', (keys) => [...keys, 'j'])` keeps down and adds `j`. Two such bindings by one name both apply, and a list still replaces. The type `Binding` names what `bind` takes.
