# AGENTS.md

binnacle is a terminal app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). What it is, and why, is [its intent](intents/binnacle/intent.md).

## Start here

1. Load the skill of your role, in `.agents/skills/<role>/`. Your prompt names your role.
2. Read [`CODING-STANDARD.md`](CODING-STANDARD.md) before you write a file that is committed.

## Where things are

```text
intents/<slug>/intent.md    what is wanted, why, and in which stages
.agents/skills/             one skill for each role, and shared skills
.agents/roles.json          the tool and the model that take each role
.agents/task.md             a task's folders, states and hand-offs
scripts/                    the checks, each with its test
references.json             the repositories that pnpm refs fetches into .refs/
.refs/<name>/               each reference at its pin, to read and never to write
```

A task is a GitHub issue. The intent lists the issues of its current stage.

## Commands

| Command | Does |
|---|---|
| `pnpm install && pnpm refs` | Installs, and fetches each reference into `.refs/` |
| `pnpm test` | Runs every check, then every test. CI runs it on each PR. |
| `pnpm fmt` | Formats the tree |
