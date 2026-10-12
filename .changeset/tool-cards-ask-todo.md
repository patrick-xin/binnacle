---
'binnacle': patch
---

dsh's ask-user and todo tools draw as a person reads them, not as JSON. A todo card draws each item on its line, `[x]` in the `muted` Tone when completed, `[ ]` in `accent` when in progress, and `[ ]` when pending. An ask card draws each question, then `→` and its answer once it came. Neither card folds: a click on its first line only Marks it. An author changes them with the Looks `transcript.tool.todo_write` and `transcript.tool.ask_user_question`.
