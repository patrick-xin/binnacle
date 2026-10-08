# AGENTS.md

binnacle is a terminal app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). What it is, and why, is [its Intent](intents/binnacle/intent.md).

## Start here

1. Load the skill of your role, in `.agents/skills/<role>/`. Your prompt names your role.
2. Read [`CODING-STANDARD.md`](CODING-STANDARD.md) before you write a file that is committed.

## Where things are

```text
intents/<slug>/intent.md    what is wanted, why, and in which Stages
packages/binnacle/          the app: a dsh bundle, its core and its plugins
docs/adr/                   the decisions that bind more than one Task
docs/glossary.md            binnacle's words, for a person and an author
docs/features.md            each feature: what a person sees, its row and its code
.agents/glossary.md         the words of the agents' workflow
.agents/skills/             one skill for each role, and shared skills
.agents/roles.json          the tool and the model that take each role
.agents/task.md             a Task's folders, states and Hand-offs
.agents/try.md              how the Lead tries a branch under dsh
scripts/                    the checks and the Task tool, each with its test
references.json             the repositories that pnpm refs fetches into .refs/
.refs/<name>/               each Reference at its pin, to read and never to write
```

A Task is a GitHub issue that is built: a Ticket, a Fix or a Chore. A Spec designs one feature of a Stage, and its Tickets are its sub-issues. The Intent lists the Specs of its current Stage.

A change that adds a feature or a row edits the feature map in the same commit. A built-in feature is an author's example, so it imports only binnacle's entry, its own folder and packages ([ADR 3](docs/adr/0003-a-built-in-feature-is-a-default-that-holds-only-what-an-author-holds.md)); `pnpm test` fails on any other import, unless its line names its issue labelled `author-gap`: `// Author Gap #<n>`. A concept that is ours, and that could be read two ways, goes in its glossary in the same commit, capitalized there and wherever it is used in that meaning.

## Commands

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | Installs, and fetches each Reference into `.refs/` |
| `pnpm test` | Runs every check, then every test. CI runs it on each PR. |
| `pnpm fmt` | Formats the tree |
| `pnpm build` | Builds the bundle. A `binnacle` dsh profile that links `packages/binnacle` then runs it with `dsh --profile binnacle`. |
| `pnpm try <ref>` | Builds a branch or a commit in `~/.binnacle/try`, for `dsh --profile binnacle-try`. [`.agents/try.md`](.agents/try.md) says how to drive it. |
| `pnpm task` | Runs a Spec's Round 0 and its Tickets: `start`, `build`, `set`, `ask`, `answer`, `resend`, `status`, `watch`, `land`, `stop` |
