# A view builds on the one beneath it

To change one tool's card, an author should not have to redraw every card, and two plugins should be able to change cards side by side. So views registered for one key stack: the newest draws, and it is handed `next`, which draws the entry as the view beneath it does, down to binnacle's own. Each view is fenced on its own: one that throws is drawn over by the view beneath it, saying whose view failed.

## Considered Options

- **Key a view by a tool's name as well as by an entry kind.** Direct for the commonest request. Rejected because a name is one grain among many — failed calls, calls in one directory — and `next` reaches every grain with one rule.
- **Make each view a listener on a Cordis waterfall event.** It is Cordis's own shape. Rejected because Cordis runs listeners in registration order, so the oldest view would wrap the newest, and a throw runs out through every listener around it instead of being fenced.
- **One view per key, refusing a second.** A clash becomes a visible error. Rejected because a second plugin customizing the same kind is the ordinary case ([ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md)).

## Consequences

- Order matters: a plugin mounted later draws over an earlier one, and a view that never calls `next` hides everything beneath it for its key.
