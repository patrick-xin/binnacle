---
'binnacle': patch
---

Typing `/` in the composer offers dsh's commands above it, each with its description, and the offer narrows as the person types. Up and down move the mark. Enter runs a command, or puts it in the draft for its input. Tab completes, and esc closes the offer. The row is `binnacle-commands`: with it off, a command typed in full still runs.

An author reads the model `commands`. The actions `commands.open`, `commands.close`, `commands.pick` and `commands.complete` change the offer. The Look `commands.list.row` draws a command. An edit of the Chat moves the offer, and `COMMANDS_LAYOUT` is there to build on. A List keeps its mark in view while the person types in another Place. `composer.send` sends a draft that was set in the same call.
