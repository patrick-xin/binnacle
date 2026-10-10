# Status line

Row `binnacle-status-line` · Code `binnacle:packages/binnacle/src/plugins/status-line/index.ts#apply` · Intent: [Authoring](../../intents/authoring/intent.md)

## What a person can do

- See one line in the Chat: whether the agent is idle or running, and its model, such as `idle · gpt-6-luna`.
- On a stored session, see that it is read only, and its id.
- On a terminal narrower than the line, see it cut at its end with `…`. It never wraps to a second line.

## What an author can change

- One segment's look: the Look by its Place's name, `status.state` or `status.model`, is given the segment's value and returns its line. So `running` can draw in the accent colour, and the other segment stays as it was.
- A segment of their own: `binnacle.edit('status', { insert: { place: 'cwd' }, after: 'status.model' })`, and a Part in `cwd`. It is joined by the theme's `divider` glyph, ` · ` by default.
- The whole status line: the Layout `status`, set again, or built on `STATUS_LAYOUT`, which `binnacle/plugins/status-line` exports. Or turn off its row, and set the Layout `status` in their own plugin.
- Where the status line is in the Chat: an edit of the Chat's `{ layout: 'status' }` node.

## How it is built

- It sets the Layout `status`, `STATUS_LAYOUT`: a row with `separator: true` and the Places `status.state` and `status.model`. The Chat draws it with `{ layout: 'status', size: 'content' }`. Turned off, the row leaves no status line, as the Layout `status` is not set.
- Each segment is a Part with one line: its Look, found by `lookOf([place])`, given the value made plain. The default Look draws the value in the `text` Tone. `status.state` is given the agent's status, or `read only` on a stored session. `status.model` is given the model, or the stored session's id. A segment with no value draws nothing, and takes no divider.
- The agent's status and model are Untrusted Text, made plain with `toPlainText` before the Look is given them.
- Both segments draw again on `agent/status` for the Chat's agent.
- The core's separated row joins the segments and cuts the line ([Core](core.md)).

## Built by

Stage 2 (before Specs). Spec [#224](https://github.com/patrick-xin/binnacle/issues/224) · Ticket [#226](https://github.com/patrick-xin/binnacle/issues/226): the status line made of segments, each with its Look.
