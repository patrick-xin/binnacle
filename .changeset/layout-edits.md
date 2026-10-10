---
'binnacle': patch
---

`binnacle.edit(name, edit)` changes one node of a Layout or Screen and keeps the rest, so an author no longer restates the whole Layout to move or add one node. An edit names its node by an anchor, the name in a node's `place` or `layout`: `{ insert, after }` or `{ insert, before }` adds a node beside it, `{ remove }` takes it out, and `{ replace, with }` puts another node in its place. `binnacle.edit('chat', { remove: 'status' })` and `binnacle.edit('chat', { insert: { place: 'status', size: 'content' }, before: 'transcript' })` move the status line to the top. Edits from two plugins both apply, in an order that never depends on which loads first. The type `Edit` names what `edit` takes.
