# Coding standard

These rules apply to every file that is committed, and to issues and PRs. `pnpm test` holds the rules that a machine can check.

## References

- `pnpm refs` fetches each repository in [`references.json`](references.json) into `.refs/<name>`, at its pin. Never write under `.refs/`.
- Cite another repository as `` `name:path` ``, with `#symbol` if needed: for example `` `pi:packages/tui/src/tui.ts` ``. Cite this repository as `binnacle`. `pnpm test` resolves each citation at its pin.
- The source is the authority. `dsh` is the authority on the harness, and `pi` on pi-tui. `codex` and `eve` show what a terminal can do. `binnacle-v0` is binnacle before the fresh start.
- A limitation is a reading. Name the reference where you read it, and put the reading on the issue that it informs.
- A reference that only one machine has goes in `references.local.json`, which git ignores. Never cite it in a tracked file or an issue.
- A home path or a privacy placeholder never goes in a tracked file. A tool's own folder under home, such as `~/.binnacle` or `~/.dsh`, is the same on every machine, so it is allowed. If your tool shows you a value as a placeholder, read the value from where it lives.

## Records

| Record | Home |
|---|---|
| What is wanted, why, and in which stages | the intent |
| One task | its GitHub issue |
| A decision that binds more than one task | an ADR in `docs/adr/` |
| What one change did, and why | its commit message, in Conventional Commits |
| The proof of each test, and each review round | its PR |

- Each fact has one home. Everywhere else links to it.
- An ADR stands on its own. It cites nothing, and it links only other ADRs.

## Prose

- All prose follows [`STE.md`](STE.md).
- A document that agents load also follows the `writing-for-agents` skill.
- Use the owner's word: dsh's, Cordis's or pi-tui's. Make a new word only when no owner has one.
