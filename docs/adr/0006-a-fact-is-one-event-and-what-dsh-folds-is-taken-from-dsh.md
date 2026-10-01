# A fact is one event, and what dsh folds is taken from dsh

A fact is one session event adapted, purely, into binnacle's own type, and a kind with no adapter is an `unknown` fact carrying its raw record. What dsh already folds — which events the model saw, what a compaction shadowed, a session's model, whether a turn runs — is read from dsh's live session and services, never derived again. binnacle's models fold only what dsh does not, such as pairing a call with its result and grouping a turn.

## Considered Options

- **Facts already paired**, a call joined to its result as one fact. Fewer joins for a view. Rejected because a paired fact is incomplete until its last event arrives, so facts would be revised rather than appended, and an author adapting a new tool loop would have to learn that state machine instead of mapping one event.
- **Fold everything in binnacle's models.** The simplest boundary. Rejected because models cannot import dsh, so they would derive again what dsh computes and owns.
- **Run dsh's fold in the facts layer, over the log.** Pure and testable. Rejected because it fails on a log whose plugins wrote projections binnacle has no interpreter for, which the live session already has.
