---
name: grill
description: Grill a person about a plan, an idea or an Intent until both sides agree. Use when the Maintainer says "grill", or when the Lead brainstorms an Intent.
---

# Grill

Interview the person until you both agree on what is wanted. Map the talk as a **design tree**: each decision branches into the decisions that depend on it.

## Rounds

1. Find the **frontier**: each decision whose prerequisites are settled.
2. Ask the whole frontier in one Round. Number each question, and give your recommended answer.
3. Wait for the answers.
4. Find the new frontier, and ask the next Round.

A question that depends on another open question goes in a later Round.

Write a Round like this:

```
❓ **Q1** - **<title>**: <the question, with its options>

➡️ <your recommended answer, and one reason>

---

❓ **Q2** - ...
```

## Facts and decisions

- A fact is yours to find. Read the repository, or send a subagent to read the References. Ask the person only for decisions.
- While a subagent reads, ask the questions that do not depend on its answer.
- Check each word against the glossary and the owner's words. If a word has two meanings, ask which one the person means.

## The end

The grill ends when the frontier is empty: each branch is visited, and nothing is assumed.

1. List what was decided.
2. Ask the person to confirm the list.
3. Write the decisions where they belong: an Intent, a Spec or an ADR.
