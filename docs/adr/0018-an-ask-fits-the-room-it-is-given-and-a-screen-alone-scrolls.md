---
status: proposed
---

# An ask fits the room it is given, and a screen alone scrolls

An ask — a question, an approval, a list to choose from, an author's ask — fits the room the surface gives it. Its edges are always drawn. When what it holds is taller than the room, its prose is paged by keys first, then its offers are shown in a window that follows focus, saying where it is. Nothing scrolls inside an ask: scrolling is a screen's, and content too long to page is read on a screen of its own. The rule is the ask's, so it holds wherever an ask is placed and whatever it holds; the room is the host's to give, read on every frame; and a person may make every ask a box of a height of their own.

## Considered Options

- **Put the composer's place and the dialog in a scroll view, as a placed screen is.** It reuses pi-tui's scrolling. Rejected because pi-tui sizes a scroll view only on the alternate screen: the dialog and the main screen would still cut an ask off, and the rule would stay each place's decision rather than the ask's.
- **Scroll inside the ask, by the wheel and by keys, in a box of fixed height.** Everything is reachable. Rejected because the keys a person already uses to move among offers should be what brings an offer into view, and the edge naming those keys should never scroll away.
- **Leave overflow to each feature.** Rejected because one frame would behave differently from one feature to the next, which is what one container exists to prevent.

## Consequences

- A question, an approval and a list read the same; only the content differs.
- The room is a fact the host passes down, beside the time and the key table, so an ask's layout stays a function of what it is given: tested as lines at a width and a height.
- Scroll bars and the wheel belong to screens alone.
- What a click inside an ask means is the gesture table's ([ADR 7](0007-content-offers-affordances-the-surface-owns-gestures.md)); the keys are the one key table's ([ADR 8](0008-a-key-means-something-only-through-one-key-table.md)); placements are [ADR 13](0013-placements-reach-the-whole-screen.md)'s.
