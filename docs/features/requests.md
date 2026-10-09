# Requests

Rows `binnacle-requests`, `binnacle-approvals`, `binnacle-questions` · Code `binnacle:packages/binnacle/src/plugins/requests/index.ts#apply`, `binnacle:packages/binnacle/src/plugins/approvals/index.ts#apply`, `binnacle:packages/binnacle/src/plugins/questions/index.ts#apply` · Intent: [authoring](../../intents/authoring/intent.md)

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

**Both:** a second Request waits until the first is answered, in the order they came. A Request that dsh withdraws goes. When a row of the feature unloads, an approval that still stands fails closed, and a question is dismissed.

## What an author can change

- Draw the Requests in a view of their own, from the model `ctx.binnacleRequests`: the Request on view, how many stand, and `watch`. The view calls `attach()`, and the model answers dsh while a view is attached.
- Change a Request's draft without sending anything: a question's `toggle`, `write`, `go` and `type`, and an approval's `choose`. Only `submit()` or `dismiss()` answers dsh.
- Replace how the Requests are drawn: turn off the rows `binnacle-approvals` and `binnacle-questions`, and draw from the model in a plugin of their own. While one of those rows is on, it fails closed a Request of the kind that no row of theirs draws.

## How it is built

- **The model is a row of its own**, `binnacle-requests`, in `packages/binnacle/src/plugins/requests/`. It talks to dsh, holds the queue and each Request's draft, and draws nothing. Its types are in the author API, `api.ts`.
- **What the model holds:** the Request on view and the queue, each question's draft and which question is on view, whether the person types, an approval's chosen outcome, and the plain text of everything. An option keeps its `label` as the agent offered it, which is what `toggle`, the drafts and the answer carry, and its `text` made plain, which is what is drawn. The mark is the view's.
- **It answers dsh only while a view is attached.** With none, its listener passes a Request on to dsh's own fallback, which fails it closed. When the last view detaches, or the model's row unloads, each Request that stands fails closed: an approval is `unavailable`, and a question is dismissed. A Request that has gone ignores every call made on it after.
- **The old rows are views.** `binnacle-approvals` draws the approvals and `binnacle-questions` the questions; each attaches to the model. A Request of a kind whose row is off fails closed when it comes on view. The model tells them of a change at once, so a Request is drawn as it comes; its other watchers learn in a microtask.
- **A Request is a Part placed over the composer**, so it takes the composer's keys while it stands, and every other key does nothing.
- **The keys** are the Gesture Table's `tui.select.*` actions, so a person who rebinds them rebinds every list. The typed line is pi-tui's input, copied.
- **The listener is scoped to the Chat's agent**, so it answers that agent and each agent under it, and no other. On a stored session it listens to nothing, and dsh fails closed.
- **dsh's own words** are kept: "Allow once" is `allowed-once` and "Reject" is `rejected`; dsh has no "always", so binnacle has none.
- **Arguments** come from the Chat's `tool/call` event, as JSON indented by two, at most 12 lines then `… and N more lines`.
- **A withdrawal** is answered `cancelled`, or `ASK_ABORTED` for a question, whether the Request is shown or waits, even when its signal aborted before dsh dispatched it.

## Built by

Specs [#157](https://github.com/patrick-xin/binnacle/issues/157), [#158](https://github.com/patrick-xin/binnacle/issues/158) and [#184](https://github.com/patrick-xin/binnacle/issues/184) · PRs [#169](https://github.com/patrick-xin/binnacle/pull/169) and [#170](https://github.com/patrick-xin/binnacle/pull/170) · Ticket [#195](https://github.com/patrick-xin/binnacle/issues/195): the model, as a row of its own.
