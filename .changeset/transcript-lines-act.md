---
'binnacle': minor
---

A transcript Look can now return a line as `{ text, fold: '<region>' }` or `{ text, run: '<action>' }`, beside a plain string, as the type `Line` from `binnacle/plugins/transcript`. A click on a `fold` line folds that region, and a click on a `run` line runs that action, given the cell clicked. An event's Look is given `isFolded(region)` beside `folded`. Every fold, by enter or by a click, goes through `transcript.fold`, so an empty `transcript.fold` stops every fold. `binnacle.run(id, at)` gives the action the cell, as a click does.

Breaking: `folded` in the model `transcript` holds regions as strings, `'12'` for the event of seq 12 and `'12/body'` for a part of it, not seqs. A plugin that pushes a seq must push `String(seq)`. `EventLook` and `LiveLook` return `Line[]`, so a Look that changes the lines beneath it reads a line's text with `typeof line === 'string' ? line : line.text`.
