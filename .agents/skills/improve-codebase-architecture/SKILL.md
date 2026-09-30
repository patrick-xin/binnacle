---
name: improve-codebase-architecture
description: Scan binnacle for deepening opportunities where its code keeps changing, present them as a visual HTML report, then grill through whichever one the maintainer picks.
argument-hint: "[a folder, a file or a pain point]"
disable-model-invocation: true
---

# Improve codebase architecture

Find **deepening opportunities**: changes that turn shallow modules into deep ones, so behaviour lives with what owns it, tests reach it at its seam, and an agent finds it in one place.

Load `codebase-design` for the vocabulary — **module**, **interface**, **depth**, **seam**, **leverage**, **locality** — and its tests: the deletion test, the interface is the test surface. Use those words in every candidate, and the glossary's for what binnacle's modules are about. The decision records are settled: a candidate that contradicts one is raised only where the friction is worth reopening it, marked on its card.

## 1. Explore

**Scope first.** Where the maintainer named a folder, a file or a pain point, look there. Otherwise find the hot spots — files that changed in the most of the last twenty merged pull requests — and start with them:

```sh
git log --first-parent --merges -20 --format=%H main | while read m; do git diff --name-only "$m^1" "$m"; done | grep '^packages/binnacle/src/' | sort | uniq -c | sort -rn | head
```

Read `docs/architecture.md`, `layers.json`, `pnpm map <folder>` and the folder notes for the hot spots. Then have a subagent walk the code, noting where it met friction:

- **A rule decided where it is used, not where it belongs**: what a block, a registration or a layer promises, decided again by each placement or caller, and differently.
- **Shallow modules**: an interface nearly as large as what it hides.
- **A closure or a function that holds a layer's state** — the host's above all, which should be thin: tested only through the most expensive seam because nothing smaller holds the behaviour.
- **Logic copied across plugins** that belongs a layer down (ADR 5).
- **Tests that reach past an interface**, or behaviour no seam reaches.

Apply the deletion test to each suspect: would deleting it concentrate complexity in one place, or spread it across its callers?

## 2. Report

Write one self-contained HTML file to `$TMPDIR` (or `/tmp`) as `architecture-review-<timestamp>.html`, open it with `open`, and give its path. [HTML-REPORT.md](HTML-REPORT.md) is the scaffold. Each candidate is a card:

- **Files**: the modules involved, as citations.
- **Problem**: the friction, with the issue or review finding where it showed.
- **Solution**: what would change, in plain words.
- **Benefits**: in locality and leverage, and which tests would move to a cheaper seam.
- **Before and after**: a diagram of each, side by side.
- **Strength**: `Strong`, `Worth exploring` or `Speculative`.

End with the one you would take first, and why. Propose no interface yet: ask which candidate to explore.

## 3. Grill the chosen one

Load `grilling`, and walk the maintainer through its decisions: its constraints, what sits behind the seam, which tests survive and which move. Load `domain-modeling` as terms and decisions land: a new name goes into the glossary, and a decision that binds beyond one feature is offered as a record. Where the maintainer rejects a candidate for a reason the next review would need, offer to record it, so it is not proposed again. When it is settled, suggest `/to-spec`.
