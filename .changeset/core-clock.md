---
'binnacle': patch
---

The core names the model `clock`. Read it with `binnacle.modelOf('clock')`: its state's `now` is the time in epoch milliseconds. A Part or a Look that names it in its `models` is drawn again each second while it reads `now`, so a time since an event counts up while it is on screen. Once a second passes with no read, the clock stops, so it costs nothing while nothing shows a time. `set` on the clock does nothing. The type `ClockState` names its state.
