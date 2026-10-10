---
'binnacle': minor
---

The status line is made of segments, and an author changes one without copying the rest. It is the Layout `status`, a row with `separator: true` and the Places `status.state` and `status.model`, exported from `binnacle/plugins/status-line` as `STATUS_LAYOUT`. Each segment draws through the Look by its Place's name, given its value, so `binnacle.look('status.state', …)` changes that segment alone. An author adds a segment with `binnacle.edit('status', { insert, after: 'status.model' })`, and it is joined by the theme's new `divider` glyph, ` · `. A row with `separator: true` draws one line: the first line of each child, joined by `divider`, and cut at its end with `more`. The status line no longer wraps on a narrow terminal.

The Chat draws `{ layout: 'status' }` where it drew `{ place: 'status' }`. A Part placed in the Place `status` no longer draws: place it in a segment, or set the Layout `status`. The types `Glyph` and `Layout` gain `divider` and a row's `separator`.
