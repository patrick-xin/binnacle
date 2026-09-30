---
name: implement
description: "Build an issue: /implement #<n>. The Sheepdog builds it solo with a held GPT reviewer, or proposes Sheep when it is big enough."
argument-hint: "#<issue>"
disable-model-invocation: true
---

Load the `sheepdog` skill, then build the issue the maintainer named, as it says:

1. **Read the issue** with `gh issue view <n>`. Its seams must be agreed; where they are not, propose them and stop until the maintainer agrees.
2. **Say how it will be built**: solo, or with Sheep and which slices, and why. Build solo unless the issue's rest would keep a Sheep busy while you check other work. Wait for the maintainer's word only where you proposed Sheep.
3. **Build it** on a branch cut from `main` named `issue-<n>`, with the `tdd` skill for every test.
4. **Review it** with the reviewer the `review` skill holds for the issue, round after round, until a round is clean.
5. **Try it**, open the pull request with the `pr` skill, and give the maintainer the list of what to ratify and try.
