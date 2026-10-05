export function reportFile(round, pass) {
  if (round > 0) return `review-${round}.md`
  return pass <= 1 ? 'review-0.md' : `review-0-${pass}.md`
}

export function handoffFor(change, c, asker) {
  const report = `${c.folder}/${reportFile(c.round, c.pass)}`
  // The tool of the main checkout: the agent's own checkout may hold another version of it.
  const tool = `pnpm -C ${c.repo} task`
  const verdict = `Write the report to ${report}, then set the state with \`${tool} set ${c.n} changes\` or \`${tool} set ${c.n} approved\`, and end your turn.`
  switch (change.kind) {
    case 'start':
      return {
        role: 'reviewer',
        start: true,
        text: `You are the Reviewer. Load the reviewer skill in .agents/skills/reviewer/ first. Round 0 of #${c.n}: check the spec only (\`gh issue view ${c.n}\`). ${verdict}`,
      }
    case 'build':
      return {
        role: 'implementer',
        start: true,
        text: `You are the Implementer. Load the implementer skill in .agents/skills/implementer/ first. Build issue #${c.n} in ${c.worktree}, on the branch task/${c.n}. Round 0 is approved. Your task folder is ${c.folder}. Set your state with \`${tool} set ${c.n} <state>\`, as .agents/task.md says.`,
      }
    case 'answer':
      return {
        role: asker,
        start: false,
        text: `The Lead answered your question of #${c.n}: read ${c.folder}/answer-${c.k}.md, and continue from the state you had. The Lead set that state again, so do not set it yourself.`,
      }
    case 'set':
      switch (change.to) {
        case 'spec':
          return {
            role: 'reviewer',
            start: false,
            text: `Round 0, pass ${c.pass} of #${c.n}: the Lead edited the spec, and its newest comment says why (\`gh issue view ${c.n} --comments\`). Check each finding of the last pass first, marked fixed or still open, then what the edits touched. ${verdict}`,
          }
        case 'ready':
          return {
            role: 'reviewer',
            start: false,
            text: `Round ${c.round} of #${c.n} at ${c.tip}: the commits ${c.base}..${c.tip}. In your checkout ${c.review}, run \`git switch --detach ${c.tip}\`, install if \`node_modules\` is missing or the lockfile changed, and run \`pnpm test\`. ${c.round > 1 ? 'Check each finding of the last round first, then what the commits touched.' : 'Review the commits against the spec.'} ${verdict}`,
          }
        case 'changes':
          return c.round === 0
            ? undefined
            : {
                role: 'implementer',
                start: false,
                text: `Round ${c.round} of #${c.n} has findings: read ${report} in full, fix each finding, prove each new test, and set \`ready\` again with \`${tool} set ${c.n} ready\`.`,
              }
        case 'approved':
          return c.round === 0
            ? undefined
            : {
                role: 'implementer',
                start: false,
                text: `Round ${c.round} of #${c.n} is approved. Write ${c.folder}/message.md, as the implementer skill says, and end your turn.`,
              }
        default:
          return undefined
      }
  }
}
