---
'binnacle': patch
---

A person answers the agent's questions, and reviews its plan. A Request takes the composer's Place — the header as its title, the question, its detail, and each option as a Choice with its description — and enter picks the marked Choice, up and down move the mark, and a click picks too. A question that allows more than one Choice selects and unselects them, with `Done` to send; `Type an answer` opens a line whose enter sends, trimmed, and esc goes back; a question with no options opens the line at once, where esc dismisses the whole Request, as esc on the Choices does. Page up and page down move a Request taller than its Place. Several questions come one after another, with `1 of 3` in the title, and their answers go back together; a plan review draws the plan as its detail and puts the Choice that approves it first. A question and an approval share one queue, and a withdrawn Request goes. The rows are `binnacle-questions` and `tool-ask-user`.
