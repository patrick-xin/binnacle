---
'binnacle': patch
---

An author makes a Line and Tabs from the Kit. `line(binnacle, { name, shown, submit, escape, key })` draws a line that a person types in, which takes every key while it is shown and keeps each key's text in its Model. `tabs(binnacle, { name, labels, current, go, keysIn })` draws tabs that a click, tab and shift+tab move between, even while a Line takes the keys. Both draw with the theme and with the Looks `line.row` and `tabs.tab`. The package exports `line` and `tabs`, and their types.
