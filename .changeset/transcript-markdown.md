---
'binnacle': patch
---

Answers in the transcript draw as markdown, committed and while they stream: headings, bold, italic, inline code, code blocks, lists, quotes, links and rules. An author draws markdown of their own with `markdown(binnacle, text, width)` from `binnacle`, changes one kind of block with its Look, `markdown.heading`, `markdown.paragraph`, `markdown.code`, `markdown.item`, `markdown.quote` or `markdown.rule`, and recolours it with the new Tones `heading`, `code` and `link`. The package now depends on `marked`.
