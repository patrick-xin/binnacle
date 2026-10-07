# Glossary of the agents' workflow

One canonical term for each concept of the workflow that builds binnacle. A term is capitalized wherever it is used in that meaning, so it reads apart from the plain word. Each entry names the record that holds its full rule. binnacle's own words are in [`docs/glossary.md`](../docs/glossary.md).

## Roles

- **Maintainer** — the person who approves Intents, tries each Stage, and merges one-way PRs. Home: [`AGENTS.md`](../AGENTS.md). <a id="maintainer"></a>
- **Lead** — the agent that turns what the Maintainer wants into Tasks, and checks what comes back. Home: [the `lead` skill](skills/lead/SKILL.md). <a id="lead"></a>
- **Implementer** — the role that builds one Ticket in its own worktree: the Lead, a Claude Code subagent or a pi agent, as the Maintainer chooses. Home: [the `implementer` skill](skills/implementer/SKILL.md). <a id="implementer"></a>
- **Reviewer** — the agent, of another model family, that reviews a Spec and then a diff. Home: [the `reviewer` skill](skills/reviewer/SKILL.md). <a id="reviewer"></a>
- **Researcher** — the agent that answers one question from the References. Home: [the `researcher` skill](skills/researcher/SKILL.md). <a id="researcher"></a>

## From what is wanted to what is built

- **Intent** — what is wanted, why, and in which Stages. It holds no design, so it is not a Spec. Home: `intents/<slug>/intent.md`. <a id="intent"></a>
- **Stage** — a part of an Intent that ends in a behaviour the Maintainer can try under dsh. Home: the Intent. <a id="stage"></a>
- **Task** — one GitHub issue that is built, in one Lane: a Ticket, a Fix or a Chore. Home: [`task.md`](task.md). <a id="task"></a>
- **Lane** — how a Task is built and reviewed: Fix, Chore or Build. Not a Door. Home: [the `lead` skill](skills/lead/SKILL.md). <a id="lane"></a>
- **Spec** — the issue that designs one feature of a Stage: its behaviours, its seams, its decisions and its Tickets. Round 0 checks it. It is not a Ticket. Home: [the `spec` skill](skills/spec/SKILL.md). <a id="spec"></a>
- **Ticket** — one vertical slice of a Spec, as a sub-issue of it, built on one branch and merged in one PR. The Build Lane holds the Tickets. Home: [the `tickets` skill](skills/tickets/SKILL.md). <a id="ticket"></a>
- **ADR** — a decision that binds more than one Task, not one Spec's decision. Home: `docs/adr/`. <a id="adr"></a>

## Review and merge

- **Round** — one review by the Reviewer. Round 0 reviews a Spec, and each Round after it reviews a Ticket's diff. Home: [`task.md`](task.md). <a id="round"></a>
- **Door** — one-way or two-way: whether a PR is cheap to walk back. The Maintainer merges a one-way PR. Not a Lane. Home: [the `lead` skill](skills/lead/SKILL.md). <a id="door"></a>
- **Hand-off** — the prompt that the Task tool sends to the next role when a Task's state changes. Home: [`task.md`](task.md). <a id="hand-off"></a>

## Sources

- **Reference** — another repository, fetched at its pin into `.refs/`, to read and never to write. Home: [`CODING-STANDARD.md`](../CODING-STANDARD.md). <a id="reference"></a>
- **Citation** — a path in a Reference or in this repository, in backticks: `` `name:path#symbol` ``. `pnpm test` resolves each one. Not a link. Home: [`CODING-STANDARD.md`](../CODING-STANDARD.md). <a id="citation"></a>
