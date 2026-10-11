---
'binnacle': patch
---

A person runs a command, such as `/compact`, by typing it in the composer and pressing enter. The model never sees the line, and the transcript shows the command and what it said. A command that fails keeps the draft. A line whose name is no command, such as a skill's `/name`, is sent as a prompt, as before. While a command runs, the model `composer`'s new `running` is `true`, and enter sends nothing.
