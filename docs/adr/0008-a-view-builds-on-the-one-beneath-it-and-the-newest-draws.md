# 8. A view builds on the one beneath it, and the newest draws

- Status: accepted; revises how views are registered in [ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)
- Date: 2026-09-26

## Context

[ADR 0](0000-everything-is-a-plugin-a-person-changes-by-asking-an-author-agent.md) commits that an author changes what a person asked about, at the grain they asked for, and builds on what binnacle draws instead of copying it. A person asks for one tool's card to show its exit code; another plugin in the same profile has already restyled a different tool's card.

A view was keyed by an entry kind and replaced binnacle's drawing of that kind whole, and a second plugin registering the same key was refused. So changing one tool's card meant redrawing every tool's card, and two plugins could not both touch tool cards.

Cordis already has a shape for this: a `waterfall` listener receives `next`, calls it to delegate, and returns without it to short-circuit (`dsh:docs/cordis-primer.md`).

## Decision

**Registrations for one key stack: the newest draws, and a view is handed `next`, which draws the entry as the view beneath it does.** The bottom of every stack is binnacle's own drawing.

- A view builds on what it is handed, or leaves an entry it does not claim to `next`. So one tool's card is a view that checks the tool's name, and every other card stays as the view beneath it draws it.
- Disposing a registration gives its place back, wherever it sits in the stack.
- Each view is fenced on its own. A view that throws, or returns what cannot be laid out, is drawn over by the view beneath it, which says whose view failed and why.
- Adapters stack the same way: the newest adapter of an event type reads it. An adapter is not handed `next`: it names a fact of its own, so there is nothing beneath it to build on.

## Alternatives considered

**Key a view by a tool's name as well as by an entry kind.** It is direct for the commonest request. It lost because a tool's name is one grain among several: a person may ask about failed calls, or calls touching one directory. Handing a view `next` reaches every such grain with one rule, and a name-keyed view would share its key space with the names authors give their facts.

**Make each view a listener on a Cordis `waterfall` event.** It is Cordis's own shape, and nothing to build. It lost for two reasons. Cordis runs listeners in registration order, so the oldest view would wrap the newest, and an author could not build on what an earlier plugin drew. And a throw in one listener runs out through every listener around it, where binnacle must fence the one that threw and draw what was beneath it.

**Keep one view per key, and refuse a second.** Two plugins claiming one key is then an error a person sees, not a silent override. It lost because under ADR 0 a second plugin customizing the same kind is the ordinary case, and a person who wants one plugin out disposes it.

## Consequences

- A request about one tool, or one kind of failure, is one small view that leaves the rest to `next`.
- Order matters. A plugin mounted later draws over one mounted earlier, and a plugin that never calls `next` hides everything beneath it for its key.
- A stack of views costs one call per view for each entry, paid when the entry is drawn, not at every frame ([ADR 9](0009-a-view-is-drawn-once-for-each-entry-and-again-when-its-author-invalidates-it.md)).
