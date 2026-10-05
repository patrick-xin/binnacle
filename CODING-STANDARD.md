# Coding standard

These rules apply to every file that is committed, and to issues and PRs. `pnpm test` holds the rules that a machine can check.

## References

- `pnpm refs` fetches each repository in [`references.json`](references.json) into `.refs/<name>`, at its pin. Never write under `.refs/`.
- Cite another repository as `` `name:path` ``, with `#symbol` if needed: for example `` `pi:packages/tui/src/tui.ts` ``. Cite this repository as `binnacle`. `pnpm test` resolves each Citation at its pin.
- The source is the authority. `dsh` is the authority on the harness, and `pi` on pi-tui. `codex` and `eve` show what a terminal can do. `binnacle-v0` is binnacle before the fresh start.
- A limitation is a reading. Name the Reference where you read it, and put the reading on the issue that it informs.
- A Reference that only one machine has goes in `references.local.json`, which git ignores. Never cite it in a tracked file or an issue.
- A home path or a privacy placeholder never goes in a tracked file. A tool's own folder under home, such as `~/.binnacle` or `~/.dsh`, is the same on every machine, so it is allowed. If your tool shows you a value as a placeholder, read the value from where it lives.

## Records

| Record | Home |
|---|---|
| What is wanted, why, and in which Stages | the Intent |
| One Task | its GitHub issue |
| A decision that binds more than one Task | an ADR in `docs/adr/` |
| What one change did, and why | its commit message, in Conventional Commits |
| The proof of each test, and each review Round | its PR |

- Each fact has one home. Everywhere else links to it.
- An ADR stands on its own. It cites nothing, and it links only other ADRs.

## Prose

- All prose follows [`STE.md`](STE.md).
- A document that agents load also follows the `writing-for-agents` skill.
- Use the owner's word: dsh's, Cordis's or pi-tui's. Make a new word only when no owner has one.

## Comments

- Write no comment by default. Names and types are the documentation.
- Write a comment only for what the code cannot say: a reason that is not obvious, a rule that must stay true, or a surprising edge case.
- A comment says why. It never says what the code does.
- A file has no header comment, unless it holds a reason of this kind.
- A test needs no comment: its name says the behaviour.
