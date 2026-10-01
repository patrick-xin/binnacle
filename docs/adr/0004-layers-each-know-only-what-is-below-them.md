# Layers each know only what is below them

binnacle is maintained by agents, who must find where a behaviour lives and prove a change without watching a terminal. So its code is in layers, each importing only what is below it, from the session log adapted into facts up to the host, which alone touches the terminal, the runtime and the process; `layers.json` states what each may import, and a gate holds it. Panes, the pi-tui components that draw views, are a layer of their own beneath the host, so the lint that keeps the clock and the process out of the pure layers holds them too.

## Considered Options

- **Three layers: a drawing grammar, models and features.** Fewer boundaries. Rejected because the grammar layer becomes where anything shared goes, until one hub imports every renderer and every renderer imports it back.
- **Declarative specs by shape — list, pager, form — that the surface renders.** A plugin would state data only. Rejected because a shape says what something looks like, not what a person can do with it: a table that offers nothing and a picker are both lists.
- **Keep panes in the host, and list the files the lint should hold.** No extra layer. Rejected because a list of files rots, and the host would hold two kinds of code a reader must tell apart file by file.
