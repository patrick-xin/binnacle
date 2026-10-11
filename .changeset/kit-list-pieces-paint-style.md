---
'binnacle': patch
---

A List's default row draws three Looks, its mark, its label and its description (`list.mark`, `list.label` and `list.description`, or `<name>.mark` and the rest), typed `ListPiece<T>`. So `binnacle.look('commands.list.label', (beneath) => (item, at) => beneath(item, at) + binnacle.paint('dim', ` ${item.hint}`))` draws a command's hint after its name, and the row stays the List's own. A command in the offer draws in one line, cut at the width with `…`, and every other List's row wraps as before. `binnacle.paint` takes a Style as well as a Tone: `binnacle.paint({ bold: true }, text)`.
