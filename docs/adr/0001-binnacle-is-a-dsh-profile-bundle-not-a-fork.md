# binnacle is a dsh profile bundle, not a fork

dsh composes every part of itself, with nothing privileged, from bundles a profile stacks and patches a person writes. binnacle mounts the same way: a bundle stacked over dsh-base, running in dsh's own process, with its built-in features as rows a person's patch can disable. An author's plugin then sits in the same profile as everything else, reaches the same services, and is removed the same way ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)).

## Considered Options

- **Fork dsh, and build the terminal into it.** Anything in dsh could be changed to suit the surface. Rejected because dsh is a preview that moves every release, and a fork carries every one of those moves by hand.
- **Be a client of a dsh server, over its protocol.** The protocol would shield binnacle from dsh's internals. Rejected because a client reaches only what the protocol carries: it cannot inject dsh's services, and an author's plugin could not sit beside dsh's own in one composition.

## Consequences

- binnacle moves with each dsh release it is pinned to, so how it reaches dsh is its own decision ([ADR 3](0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)).
