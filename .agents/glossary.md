# Glossary of the agents' workflow

The words of the agents who build binnacle. binnacle's own words, for a person and an author, are in [`docs/glossary.md`](../docs/glossary.md). Each row names the record that holds the full rule.

| Term | It is | It is not | Home |
|---|---|---|---|
| **Maintainer** | The person who approves intents, tries each stage, and merges one-way PRs. | The Lead. | [`AGENTS.md`](../AGENTS.md) |
| **Lead** | The agent that turns what the Maintainer wants into tasks, and checks what comes back. | The Implementer. | [the `lead` skill](skills/lead/SKILL.md) |
| **Implementer** | The agent that builds one Build task in its own worktree. | The Reviewer. | [the `implementer` skill](skills/implementer/SKILL.md) |
| **Reviewer** | The agent, of another model family, that reviews a spec and then a diff. | The Implementer. | [the `reviewer` skill](skills/reviewer/SKILL.md) |
| **Researcher** | The agent that answers one question from the references. | | [the `researcher` skill](skills/researcher/SKILL.md) |
| **intent** | What is wanted, why, and in which stages. | A spec: an intent holds no design. | `intents/<slug>/intent.md` |
| **stage** | A part of an intent that ends in a behaviour the Maintainer can try under dsh. | A task. | the intent |
| **task** | One GitHub issue, in one lane. | A stage. | [`task.md`](task.md) |
| **lane** | How a task is built and reviewed: Fix, Chore or Build. | A door. | [the `lead` skill](skills/lead/SKILL.md) |
| **spec** | The issue of a Build task: what it does, its seams, and its decisions. | An intent. | [the `spec` skill](skills/spec/SKILL.md) |
| **round** | One review by the Reviewer. Round 0 reviews the spec; each round after it reviews the diff. | | [`task.md`](task.md) |
| **door** | One-way or two-way: whether a PR is cheap to walk back. The Maintainer merges a one-way PR. | A lane. | [the `lead` skill](skills/lead/SKILL.md) |
| **hand-off** | The prompt that the task tool sends to the next role when a task's state changes. | | [`task.md`](task.md) |
| **ADR** | A decision that binds more than one task. | A spec's decision. | `docs/adr/` |
| **reference** | Another repository, fetched at its pin into `.refs/`, to read and never to write. | | [`CODING-STANDARD.md`](../CODING-STANDARD.md) |
| **citation** | A path in another repository or this one, in backticks: `` `name:path#symbol` ``. `pnpm test` resolves each one. | A link. | [`CODING-STANDARD.md`](../CODING-STANDARD.md) |
