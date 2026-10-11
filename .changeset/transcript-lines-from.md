---
'binnacle': patch
---

A transcript line that acts can act from a column: `{ text, fold, from }` or `{ text, run, from }` acts only at the column `from` of its text and after it, so a card folds from a `[-]` at the end of its first line, and a click on its title only Marks it. Enter folds as before. `frame` takes and gives strings or objects with `text`, and each row a line wraps to keeps its `fold` and `run`, with its `from` moved past the left edge, so a card drawn in a frame still folds. The type `Framed` names a line that `frame` takes.
