function order(name) {
  const [, round, pass] = name.match(/^review-(\d+)(?:-(\d+))?\.md$/)
  return [Number(round), pass === undefined ? 1 : Number(pass)]
}

export function reportsOf(files) {
  return files
    .filter((name) => /^review-\d+(?:-\d+)?\.md$/.test(name))
    .toSorted((a, b) => {
      const [ra, pa] = order(a)
      const [rb, pb] = order(b)
      return ra - rb || pa - pb
    })
}

export function section(body, heading) {
  const lines = body.split('\n')
  const at = lines.findIndex((line) => line.trim() === heading)
  if (at === -1) return ''
  const end = lines.findIndex((line, index) => index > at && line.startsWith('## '))
  return lines
    .slice(at + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim()
}

export function doorOf(spec) {
  const word = section(spec, '## Door')
    .split(/[\s.,]/)[0]
    .toLowerCase()
  return word === 'one-way' || word === 'two-way' ? word : undefined
}

function who(agent) {
  return [agent.tool ?? agent.runner, agent.model].filter(Boolean).join(' ')
}

// The builder's commits name no model, so the Reviewer does not know who built. The squash names both.
export function withTrailers(message, { builder, reviewer }) {
  const trailers = [
    ...(builder === undefined ? [] : [`Built-by: ${who(builder)}`]),
    ...(reviewer === undefined ? [] : [`Reviewed-by: ${who(reviewer)}`]),
  ]
  return trailers.length === 0 ? message : `${message.trimEnd()}\n\n${trailers.join('\n')}\n`
}

export function partsOf(message) {
  const [header, ...rest] = message.split('\n')
  const body = rest
    .filter((line) => !/^Closes #\d+\s*$/.test(line))
    .join('\n')
    .trim()
  return { header: header.trim(), body }
}

export function prBody({ n, message, ticket, checked, reports, place }) {
  return [
    '## Summary',
    '',
    `Ticket ${place.k} of ${place.of} of #${place.spec}, ${place.title}.`,
    '',
    partsOf(message).body,
    '',
    '## Evidence',
    '',
    "<details><summary>Each test's break and its failure (checked.md)</summary>",
    '',
    checked.trim(),
    '',
    '</details>',
    '',
    '## Merge danger',
    '',
    `**Door:** ${section(ticket, '## Door')}`,
    '',
    '**Blast radius:** <!-- the Lead fills this in -->',
    '',
    '## Checked',
    '',
    '- [x] `pnpm test` passes on the branch: the Reviewer ran it in each round.',
    '- [x] Each new test is proven: its break and its failure message are under *Evidence*.',
    `- [x] Each review round: ${reports.length} report${reports.length === 1 ? '' : 's'}, each in a comment below, oldest first.`,
    '- [ ] Tried under `dsh`, if the change draws or boots: what was driven, and what it drew.',
    '- [ ] The author API: unchanged, or the commit says what changed.',
    '',
    `Closes #${n}`,
    `Part of #${place.spec}`,
    '',
  ].join('\n')
}

export function reportComment(file, text) {
  return `${marker(file)}\n<details><summary>${file}</summary>\n\n${text.trim()}\n\n</details>\n`
}

export function marker(file) {
  return `<!-- binnacle-report: ${file} -->`
}
