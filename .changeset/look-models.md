---
'binnacle': patch
---

A Look can name the models it reads: `binnacle.look(name, make, { models })`. When one of them changes, everything drawn with Looks is drawn again, so `binnacle.look('status.state', make, { models: [ctx.binnacleRequests] })` says `waiting for you` while a Request stands, with no Part placed over the segment. The type `LookOptions` names what `look` takes.
