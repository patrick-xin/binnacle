---
'binnacle': patch
---

An author changes how one piece of a component draws, for every instance of its kind or for one instance, on top of the Look beneath it. `binnacle.look(name, (beneath) => look)` sets a Look by a kind's name, such as `list.row`, or an instance's, such as `request.choices.row`. The Look is handed the Look beneath it, found each time it draws, and goes when its plugin unloads. `binnacle.lookOf(names, fallback)` draws a piece of an author's own component. The package exports the type `Look`.
