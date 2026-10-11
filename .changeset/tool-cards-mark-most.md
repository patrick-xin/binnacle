---
'binnacle': patch
---

A shell command that ends with an exit code other than 0, or with a signal, is a failed call. Its card's `⏺` is in the `error` Tone, and `Card.result.failed` is true. A folded card of one line ends `(1 line)`. An author changes a card's dot with the Look `transcript.card.mark`. An author changes how many lines a body shows with the Look `transcript.card.most`, 12 by default. A shell's `… <n> earlier lines` still counts the lines that the body leaves out. The types `CardMarkLook` and `CardMostLook` are exported from `binnacle/plugins/tool-cards`.
