# Requests

Rows `binnacle-approvals`, `binnacle-questions` · Code `binnacle:packages/binnacle/src/plugins/approvals/index.ts#apply`, `binnacle:packages/binnacle/src/plugins/questions/index.ts#apply` · Intent: none yet

A Request is a box that the agent waits on: an approval or a question. A thing that a person picks in it is a Choice.

## What a person can do

**An approval**, when a tool needs one:

- See the tool's name in a rule, why it asks, and the call's arguments, with two Choices, `› Allow once` and `Reject`.
- Pick with enter, move the mark with up and down, which wrap, or pick with a click. Esc rejects, and does not interrupt the turn.
- Get the composer back, with its draft, once the Request is answered.

**A question**, when the agent asks:

- See the header as the title, the question, its detail, and each option as a Choice with its description, then `Type an answer`.
- Pick with enter or a click. In a question that allows more than one, enter or a click selects or unselects, and `Done` sends.
- Open a line with `Type an answer`; enter sends it, trimmed, and esc goes back. A question with no options opens the line at once, and esc there dismisses the whole Request.
- Dismiss with esc on the Choices; the agent learns that the person dismissed it.
- Move a tall Request with page up and page down.
- Answer several questions one after another, with `1 of 3` in the title; their answers go back together.
- Review a plan: the plan is the detail, and the Choice that approves it is first.

**Both:** a second Request waits until the first is answered, in the order they came. A Request that dsh withdraws goes. When a plugin unloads, an approval that still stands fails closed, and a question is dismissed.

## What an author can change

- Replace approvals or questions: turn off the row, listen for dsh's request in a plugin of their own, and place a Part in the `composer` Place.

## How it is built

- **A Request is a Part placed over the composer**, so it takes the composer's keys while it stands, and every other key does nothing.
- **The keys** are the Gesture Table's `tui.select.*` actions, so a person who rebinds them rebinds every list. The typed line is pi-tui's input, copied.
- **One queue** holds the approvals and the questions, under `packages/binnacle/src/plugins/requests/`, so a Request waits its turn beside the other plugin's.
- **The listener is scoped to the Chat's agent**, so it answers that agent and each agent under it, and no other. On a stored session it listens to nothing, and dsh fails closed.
- **dsh's own words** are kept: "Allow once" is `allowed-once` and "Reject" is `rejected`; dsh has no "always", so binnacle has none.
- **Arguments** come from the Chat's `tool/call` event, as JSON indented by two, at most 12 lines then `… and N more lines`.
- **A withdrawal** is answered `cancelled`, or `ASK_ABORTED` for a question, whether the Request is shown or waits, even when its signal aborted before dsh dispatched it.

## Built by

Specs [#157](https://github.com/patrick-xin/binnacle/issues/157) and [#158](https://github.com/patrick-xin/binnacle/issues/158) · PRs [#169](https://github.com/patrick-xin/binnacle/pull/169) and [#170](https://github.com/patrick-xin/binnacle/pull/170).
