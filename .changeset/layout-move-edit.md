---
'binnacle': patch
---

`binnacle.edit(name, { move, before })` or `{ move, after }` moves one node of a Layout beside another anchor, as it stands, with its box, its `size` and its `unless`: `binnacle.edit('chat', { move: 'composer', before: 'transcript' })` puts the composer above the transcript, and copies nothing of its node. A move applies after the inserts and before the replaces and removes, and does nothing while either anchor is not there.
