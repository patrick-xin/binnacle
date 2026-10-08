# A built-in feature is a default that holds only what an author holds

**Status:** accepted, 2026-10-08

A built-in feature is a default that an author replaces, and the living example that an author reads and copies. So it holds only what an author holds: it imports binnacle's published entry, the files of its own folder, and other packages, and nothing else of binnacle. `pnpm test` fails on any other import. What a built-in needs and an author lacks is an Author Gap: an issue labelled `author-gap`, which the import names on its line. It is closed when binnacle exports what is needed, and the import goes to binnacle's entry.

binnacle v0 took the same rule in its fifth decision record, and a check held it. The fresh start kept the Intents and not the decisions, so Stage 3's Requests imported the shared queue and the typed line from inside binnacle, and nothing failed.

## Considered options

- **A built-in feature is the product, and an author changes it where it allows.** Each built-in then has to please every person, and its seams are what its author thought of. The Intent's problem is a terminal tool that does not look or act the way a person wants.
- **A feature may import the core and the other features, and an author gets what is exported later.** The examples then teach what an author cannot do, and "an author can replace anything built in" is a claim that nothing checks. v0 rejected this for the same reason.

## Consequences

- An author changes binnacle at three levels, coarse to fine. A feature, by its row: they turn it off and install a bundle of their own. A piece of a feature, by composing the building blocks that the built-ins are made of. A small change, by a registration and no replacement: a layout, a theme name, an action, or a renderer for one type of event.
- A helper that a built-in needs becomes author API. That is the cost, and the point. Each one is a one-way door.
- A built-in is written to be read: short, and from exported pieces only.
- binnacle keeps no table of glyphs, words or spacing inside a Part. An author changes them by replacing the Part, from the pieces that the built-in uses. This narrows [ADR 2](0002-a-screen-is-a-layout-tree-of-named-places.md): its named tables keep the edges of a box.
