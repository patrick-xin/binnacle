---
'binnacle': patch
---

An author makes a List and a Title from the Kit. `list(binnacle, { name, items, pick })` draws items that a person marks with up and down, pages with page up and page down, and picks with enter or a click, and its `toggle` action has no keys until someone binds it. `title(binnacle, { name, text })` draws a rule across the width with the text in it. Both draw with the theme and with the Looks `list.row` and `title.row`. The package exports `list` and `title`, and their types.
