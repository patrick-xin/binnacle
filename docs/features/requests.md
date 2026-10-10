# Requests

Rows `binnacle-requests`, `binnacle-requests-view` · Code `binnacle:packages/binnacle/src/plugins/requests/index.ts#apply`, `binnacle:packages/binnacle/src/plugins/requests-view/index.ts#apply` · Intent: [authoring](../../intents/authoring/intent.md)

A Request is a box that the agent waits on: an approval or a question. A thing that a person picks in it is a Choice.

## What a person can do

**An approval**, when a tool needs one:

- See the tool's name in a Title, with the subagent that asks, why it asks, and the call's arguments, at most 12 lines, with two Choices, `› Allow once` and `Reject`.
- Pick with enter, move the mark with up and down, which wrap, or pick with a click. Esc rejects, and does not interrupt the turn.

**A question**, when the agent asks:

- See the header and `1 of 3` as a Title, the question, its detail, and each option as a Choice with its description, then `Type an answer`, and `Done` where more than one can be chosen.
- Pick with enter or a click. In a question that allows more than one, a pick selects or unselects, and `Done` goes on.
- Open a Line with `Type an answer`. Enter writes what was typed, trimmed, and goes on as a pick does; an empty line is not written, and the Line stays. Esc goes back to the Choices, with the Line's text and the selected options kept. A question with no options opens the Line at once, and esc there dismisses the whole Request.
- Dismiss with esc on the Choices; the agent learns that the person dismissed it, and the turn is not interrupted.
- Answer several questions one after another; their answers go back together after the last.
- Review a plan: the plan is the detail, and the Choice that approves it is first.

**Both:**

- A Request that comes takes the Focus, and the composer comes back, with its draft, once no Request stands.
- Scroll a tall Request's question and detail, or an approval's arguments, with the wheel, or with page up and page down from the Choices or the Line. The Choices and the Line stay in view beneath it.
- A second Request waits until the first is answered, in the order they came. A Request that dsh withdraws goes. When the model's row unloads, an approval that still stands fails closed, and a question is dismissed.

## What an author can change

- Draw the Requests in a view of their own, from the model `ctx.binnacleRequests`: the Request on view, how many stand, and `watch`. The view calls `attach()`, and the model answers dsh while a view is attached.
- Change a Request's draft without sending anything: a question's `toggle`, `write`, `go` and `type`, and an approval's `choose`. Only `submit()` or `dismiss()` answers dsh.
- Change what sending does: every way the default view sends runs the action `requests.send`, which sends the Request on view. A plugin sets it, and runs `beneath` to send, such as after a preview. A plugin that sends later calls its Request's `submit()`, or runs `beneath` only while that Request is on view.
- Build on the default view: the Layout `request`, with the Places `request.title`, `request.body`, `request.choices` and `request.line`. The view's entry, `binnacle/plugins/requests-view`, exports it as `REQUEST_LAYOUT`, with the view's own `titleOf`, `itemsOf`, `pick`, `advance` and `keyOf`. A Look such as `request.choices.row` changes how a piece is drawn.
- Replace how the Requests are drawn: turn off the row `binnacle-requests-view`, and draw from the model in a plugin of their own that attaches to it.

## How it is built

- **The model is a row of its own**, `binnacle-requests`, in `packages/binnacle/src/plugins/requests/`. It talks to dsh, holds the queue and each Request's draft, and draws nothing. Its types are in the author API, `api.ts`.
- **What the model holds:** the Request on view and the queue, each question's draft and which question is on view, whether the person types, an approval's chosen outcome, and the plain text of everything. An option keeps its `label` as the agent offered it, which is what `toggle`, the drafts and the answer carry, and its `text` made plain, which is what is drawn. The mark is the view's.
- **It answers dsh only while a view is attached.** With none, its listener passes a Request on to dsh's own fallback, which fails it closed. When the last view detaches, or the model's row unloads, each Request that stands fails closed: an approval is `unavailable`, and a question is dismissed. A Request that has gone ignores every call made on it after.
- **The default view is a row of its own**, `binnacle-requests-view`, in `packages/binnacle/src/plugins/requests-view/`, made from the Kit and the author API alone: a Title, a Part, a List and a Line in the Layout `request`. It attaches to the model while it is loaded. A person who turned off an old row, `binnacle-approvals` or `binnacle-questions`, turns off `binnacle-requests`, and the view goes with it.
- **The Chat draws it** with `{ layout: 'request' }` above the composer, which is `unless: 'request'`, so the Request takes the composer's spot while it stands. The body and the Choices fill inside the Layout. Each takes what its lines need while the other needs more, so a short question stays whole above many Choices, and a node that takes what its lines need shrinks the nodes in it that fill before the screen gives up its borders ([Core](core.md)), so the rule stays beneath a tall Request.
- **The Focus follows the Request.** At each change of the model, the Choices take the Focus when another Request or question comes on view, and the Line when the person starts to type. The Focus goes back to the composer once no Request is drawn.
- **The words** `Allow once`, `Reject`, `Type an answer` and `Done` are the view's, as List items. An option's item is its plain `text`, so a Look never sees its `label` raw.
- **The mark is the List's**, and starts at the first Choice for each Request and each question, by `keyOf`. Esc on the Line puts it back on `Type an answer`, as the List has no items while the Line is shown.
- **The typed text is the Line's**, by `keyOf`, so it is kept while the person goes back to the Choices, and becomes an answer only on enter.
- **Every other key does nothing on the Choices.** The action `requests.keep`, of `request.choices`, takes ctrl+c, ctrl+z and shift+tab and does nothing, so a Request that stands is not cleared, quit, suspended or left by the Focus, as before the Kit. The Line takes every key itself.
- **Sending is an action**, `requests.send`, with no keys, so that an author's plugin hides it and runs the one beneath. Esc on the Choices is `requests.dismiss`, an action of `request.choices`, so it is taken before the core's interrupt.
- **Page up and page down** are the view's actions `requests.pageUp` and `requests.pageDown`, marked `first` in `request.choices` and `request.line`, so that they reach the body while the Line takes every key. They scroll `request.body` by a page of its box. The List's own `request.choices.pageUp` and `request.choices.pageDown` are bound to no keys.
- **The listener is scoped to the Chat's agent**, so it answers that agent and each agent under it, and no other. On a stored session it listens to nothing, and dsh fails closed.
- **dsh's own words** are kept: "Allow once" is `allowed-once` and "Reject" is `rejected`; dsh has no "always", so binnacle has none.
- **Arguments** come from the Chat's `tool/call` event, as JSON indented by two, at most 12 lines then `… and N more lines`.
- **A withdrawal** is answered `cancelled`, or `ASK_ABORTED` for a question, whether the Request is shown or waits, even when its signal aborted before dsh dispatched it.

## Built by

Specs [#157](https://github.com/patrick-xin/binnacle/issues/157), [#158](https://github.com/patrick-xin/binnacle/issues/158) and [#184](https://github.com/patrick-xin/binnacle/issues/184) · PRs [#169](https://github.com/patrick-xin/binnacle/pull/169) and [#170](https://github.com/patrick-xin/binnacle/pull/170) · Ticket [#195](https://github.com/patrick-xin/binnacle/issues/195): the model, as a row of its own. Ticket [#196](https://github.com/patrick-xin/binnacle/issues/196): the default view, made from the Kit; the rows `binnacle-approvals` and `binnacle-questions` go.
