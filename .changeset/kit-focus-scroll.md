---
'binnacle': patch
---

An author's plugin wins over a built-in on every start: what binnacle's own rows register ranks beneath what an author registers, whichever loads first. An author moves the Focus to a Place by its name with `binnacle.focus(place)`, or to a Part's own Place with the `focus()` of the Handle that `binnacle.place` returns, and scrolls a Place by pages with `binnacle.scroll(place, pages)`. A Focus moved to a Place before it draws takes it once it draws. The package exports the type `PlacedHandle`.
