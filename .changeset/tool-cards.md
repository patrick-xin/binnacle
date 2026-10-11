---
'binnacle': patch
---

A person sees each tool call and its result as one card: `⏺ ` and the tool's title, a body drawn from the views dsh's tools give (a shell command's last lines, a diff's counts, a search's matches, a read's lines), and how long the call took, such as ` · 1.2s`. Enter on the Marked card, or a click on its first line, folds its body. The row is `binnacle-tool-cards`: turn it off, and a call and its result draw as two lines again. An author changes a whole card with the Look `transcript.card`, given a `Card` and `{ width, isFolded }`, or one piece of it: `transcript.card.title`, `transcript.card.time`, one card kind's body with `transcript.card.<kind>`, such as `transcript.card.terminal`, or one tool's with `transcript.tool.<name>`. The types `Card`, `CardLook`, `CardTitleLook`, `CardTimeLook` and `CardBodyLook` are exported from `binnacle/plugins/tool-cards`.
