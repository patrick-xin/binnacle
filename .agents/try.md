# Trying a branch under dsh

The Lead tries a Ticket that changes what binnacle draws or boots, and writes in its PR what was driven and what was drawn.

## Build it

`pnpm try task/<ticket>` builds the branch in `~/.binnacle/try` and links it into the `binnacle-try` dsh profile, with the Maintainer's own `cordis.patch.yml`. The `binnacle` profile keeps running the main checkout.

## Drive it

Run it in a pane of its own, and drive the pane from the shell. With herdr:

| To | Run |
|---|---|
| start | `herdr tab create --cwd /tmp --label try-<n> --no-focus`, then `herdr pane run <pane> "dsh --profile binnacle-try"` |
| type | `herdr pane send-text <pane> "<text>"` |
| press a key | `herdr pane send-keys <pane> Enter`, `Up`, `esc`, `shift+Tab`, `C-c` |
| click at a column and a row, from 1 | `herdr pane send-text <pane> "$(printf '\033[<0;%s;%sM\033[<0;%s;%sm' $col $row $col $row)"` |
| scroll up one notch | the same, with `64` for `0` and only the `M` half |
| read the screen | `herdr pane read <pane> --source visible` |
| read its styles, such as the inverse Mark | `herdr pane read <pane> --source visible --ansi`, then `grep -F $'\x1b[7m'` |
| quit | ctrl+c twice, then `herdr tab close <tab>` |

Build a click with `printf`: its press and its release must both be escapes, or the release is typed into the Place that has the Focus.

## Make dsh ask

- **An approval.** dsh's policy is `ask`, but a command inside the workspace sandbox runs with no Request. Ask the agent to touch a file in your home folder, and remove the file after.
- **A question.** Ask the agent to use its ask-user tool, and name the options and whether it is multi-select.

## See what the agent got

binnacle scrolls the transcript itself, so the terminal's scrollback does not hold it. Read the stored session instead: `zstd -dc ~/.dsh/sessions/<cwd>/session-<id>/session.v4.jsonl.zstd`. Each line is an event; a `tool/result` holds what the tool returned.

## A Person Trial

After the last Ticket of a Spec merges, the Lead drives each of the Spec's Journeys on `main`, as a person would, with no author's change turned on: `pnpm try main`.

1. Drive each Journey to its end, and then one step further: type in the composer, click the transcript, then type again.
2. At each step, read the screen as a person would. A problem is anything that shows dsh's data raw, does less than a plain terminal does, leaves the Focus where the person must move it back, or reads as noise.
3. Write the report as a comment on the Spec, under **Person Trial**: the tip that was tried, each Journey and what it drew, and each problem with the step that shows it.

## In the PR

Under **Tried under dsh**: the tip that was tried, each thing driven and what it drew, the lines quoted where they show the change, and each behaviour that was not driven by hand, with what covers it.
