---
name: domain-modeling
description: Build and sharpen binnacle's domain model while designing — challenge terms against the glossary, test them on concrete scenarios, and write the glossary and decision records as they settle. Use when a term is coined, contested or used loosely, when editing docs/glossary.md, or when a decision may need a record.
---

# Domain modeling

Sharpen binnacle's language while a design is still moving, and write it down the moment it settles. Reading [the glossary](../../../docs/glossary.md) for words is a habit every skill has; this skill is for when the model is changing.

Where each record lives, and what it may hold, is `AGENTS.md`'s *Where a record lives*: it binds, and this skill does not repeat it.

## During the session

- **Challenge against the glossary.** A term used against its row is named at once: "The glossary's *entry* is a fact or a pair; you mean a turn. Which is it?"
- **Use the owner's word.** A term dsh, Cordis or pi-tui already has is theirs, under their heading; coin one only when no owner has it, under *Ours*.
- **Sharpen fuzzy words.** An overloaded word gets one precise term, and the others it could mean are named: "Do you mean the **ask**, or the **dialog** it is placed in?"
- **Test with scenarios.** Invent the concrete case that finds the edge between two concepts: a question with forty options, an approval that arrives while the composer holds a draft, an author's view over a quiet kind.
- **Check the code agrees.** Where the maintainer states how something works, look: "The host scrolls placed screens and not placed lines, but you said every ask scrolls. Which is right?"

## Writing it down

- **A term settled goes into the glossary now**, in its table's shape: the term in bold, what it means in a sentence or two, whose word it is, and a citation where it names code. No implementation detail, and no change history.
- **Which block, placement or registration to use for what**, and how each answers, is a record a person and an author both read: it goes on its feature page, which the glossary's row links. A rule an agent could learn only from code is a gap in the records, fixed where it is found.
- **A decision is offered as a record only when it passes [the template's](../../../docs/adr/template.md) three tests.** Offer it; the maintainer decides.
