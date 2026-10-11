---
'binnacle': patch
---

A List takes `keysIn`: up, down, page up, page down and enter act on it in those Places, before the Part that has the Focus there, while it draws a line, so a List can move its mark while the person types in a Line. `list<T>` takes items of an author's own type, and `ListRow<T>` types its row Look with them. `fuzzy(query, items, text)` filters items by a query's letters in order, whatever their case, the ones that start with it first, then the closest. A Layout node's size can be `{ most: n }`: what its lines need, up to `n` cells, its box included.
