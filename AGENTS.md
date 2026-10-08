# AGENTS.md

binnacle is a terminal app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). What it is, and why, is [its Intent](intents/binnacle/intent.md).

## Start here

1. Load the skill of your role, in `.agents/skills/<role>/`. Your prompt names your role.
2. Read [`CODING-STANDARD.md`](CODING-STANDARD.md) before you write a file that is committed.

## Where things are

```text
intents/<slug>/intent.md    what is wanted and why, in the Maintainer's words: the product, or one feature
packages/binnacle/          the app: a dsh bundle, its core and its plugins
docs/adr/                   the decisions that bind more than one Task
docs/glossary.md            binnacle's words, for a person and an author
docs/features.md            the index of features, their docs and their rows
docs/features/<feature>.md  how a feature is built so far: the second source, after the code
.agents/glossary.md         the words of the agents' workflow
.agents/skills/             one skill for each role, and shared skills
.agents/roles.json          the tool and the model that take each role
.agents/task.md             a Task's folders, states and Hand-offs
.agents/try.md              how the Lead tries a branch under dsh
scripts/                    the checks and the Task tool, each with its test
references.json             the repositories that pnpm refs fetches into .refs/
.refs/<name>/               each Reference at its pin, to read and never to write
```

A Task is a GitHub issue that is built: a Ticket, a Fix or a Chore. A Spec designs one feature of a Stage, and its Tickets are its sub-issues. The feature's Intent lists its Specs.

A change to a feature edits its doc in `docs/features/` in the same commit, and a new feature or row edits the index too. A PR that changes the published package adds a changeset with a short release note: before 1.0, a fix or a feature is a `patch`, and a break of what an author may import is a `minor`. The Maintainer merges the version PR to publish. A concept that is ours, and that could be read two ways, goes in its glossary in the same commit, capitalized there and wherever it is used in that meaning.

## Commands

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | Installs, and fetches each Reference into `.refs/` |
| `pnpm test` | Runs every check, then every test. CI runs it on each PR. |
| `pnpm fmt` | Formats the tree |
| `pnpm build` | Builds the bundle. A `binnacle` dsh profile that links `packages/binnacle` then runs it with `dsh --profile binnacle`. |
| `pnpm try <ref>` | Builds a branch or a commit in `~/.binnacle/try`, for `dsh --profile binnacle-try`. [`.agents/try.md`](.agents/try.md) says how to drive it. |
| `pnpm task` | Runs a Spec's Round 0 and its Tickets: `start`, `build`, `set`, `ask`, `answer`, `resend`, `status`, `watch`, `land`, `stop` |
