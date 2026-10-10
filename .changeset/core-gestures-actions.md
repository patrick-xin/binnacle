---
'binnacle': patch
---

A key bound to an author's action with no Place reaches it while the composer has the Focus: `binnacle.gestures.actionsOf(key)` now names every action the key is bound to where the Focus is, an author's too. The core's own gestures, `binnacle.clear`, `binnacle.interrupt`, `binnacle.suspend`, `binnacle.focus.next`, `binnacle.scroll.up` and `binnacle.scroll.down`, are actions that `bind` binds and `keysOf` reads, so `binnacle.bind('binnacle.interrupt', (keys) => [...keys, 'ctrl+x'])` makes ctrl+x interrupt the turn.
