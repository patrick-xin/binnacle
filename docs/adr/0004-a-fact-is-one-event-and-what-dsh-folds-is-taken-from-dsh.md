# 4. A fact is one event, and what dsh folds is taken from dsh

- Status: accepted
- Date: 2026-09-26

## Context

The facts layer is where dsh's session log becomes binnacle's own types ([ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)). Much of what a person sees spans events: a tool card is a `tool/call` and the `tool/result` sharing its `callId`, a turn spans many steps, and a compaction replaces a range of the model-visible surface. Something has to join them.

dsh already folds some of it. `foldSurface` and a live `Session`'s `surface` say which events are model-visible and what a replacement shadowed (`dsh:packages/core/session/src/surface.ts`); `deriveEventMessage` projects an event to the message the model saw. `foldSurface` needs an interpreter for every plugin-owned message projection in the log and throws without one; the live `Session` already holds them.

## Decision

**A fact is one event, adapted: `adapt(event) → Fact`, pure (`binnacle:packages/binnacle/src/facts/adapt.ts#adapt`).** A kind with no adapter is an `unknown` fact carrying its type and raw record. A block binnacle cannot read is kept as `unread`, named by its type.

**What dsh already folds is taken from dsh, never derived again.** The model-visible surface and what a replacement shadowed come from the live `Session` the host holds, handed to the facts layer as facts.

**Models fold only what dsh does not**: pairing a call with its result, grouping a turn, the agents tree.

## Alternatives considered

**Facts already paired**, a fold returning tool cards and turns. Fewer joins for a view. It lost because a paired fact is incomplete until its last event arrives, so facts would be revised rather than appended, and the one layer that reads dsh would carry logic that does not need dsh. An author adapting a new tool loop would have to learn that state machine instead of mapping one event.

**Every fact one event, and models fold everything.** The simplest boundary. It lost because models may not import dsh, so they would re-derive the surface and its replacements, which dsh computes and owns.

**Re-run `foldSurface` in the facts layer.** Pure and testable. It lost because it throws on a log whose plugins logged message projections binnacle has no interpreter for, which the live `Session` already has.

## Consequences

- Facts are append-only and keyed by `seq`, so a view can be cached per fact.
- Test fixtures are typed as dsh's `SessionEvent`, so a dsh rename fails the typecheck of the test that reads it.
- A new tool loop's author registers one adapter per event kind, and anything unadapted is still drawn.
- The surface facts depend on the host, so they arrive with the host's session wiring, not before it.
