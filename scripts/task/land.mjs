/**
 * What `task land` writes: the PR's title and body, and a comment for each
 * review report. Each function here reads text and answers text.
 * @module binnacle/scripts/task/land
 */

/**
 * The round and the pass of a report's file name: `review-0.md` is pass 1.
 * @param {string} name - the file name.
 * @returns {[number, number]} the round and the pass.
 */
function order(name) {
  const [, round, pass] = name.match(/^review-(\d+)(?:-(\d+))?\.md$/)
  return [Number(round), pass === undefined ? 1 : Number(pass)]
}

/**
 * The review reports of a task folder, oldest first: each pass of round 0,
 * then each later round.
 * @param {string[]} files - the names in the task folder.
 * @returns {string[]} the report files, in order.
 */
export function reportsOf(files) {
  return files
    .filter((name) => /^review-\d+(?:-\d+)?\.md$/.test(name))
    .toSorted((a, b) => {
      const [ra, pa] = order(a)
      const [rb, pb] = order(b)
      return ra - rb || pa - pb
    })
}

/**
 * The text under a heading of a Markdown body, to the next `## ` heading.
 * @param {string} body - the Markdown.
 * @param {string} heading - the heading, such as `## Door`.
 * @returns {string} the text, trimmed; empty when the heading is not there.
 */
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

/**
 * The door of a spec: the first word under its `## Door`.
 * @param {string} spec - the issue body.
 * @returns {'one-way' | 'two-way' | undefined} the door, or nothing when the spec names none.
 */
export function doorOf(spec) {
  const word = section(spec, '## Door')
    .split(/[\s.,]/)[0]
    .toLowerCase()
  return word === 'one-way' || word === 'two-way' ? word : undefined
}

/**
 * Split a commit message into its header and its body, without its `Closes` lines.
 * @param {string} message - the message.
 * @returns {{ header: string, body: string }} the parts.
 */
export function partsOf(message) {
  const [header, ...rest] = message.split('\n')
  const body = rest
    .filter((line) => !/^Closes #\d+\s*$/.test(line))
    .join('\n')
    .trim()
  return { header: header.trim(), body }
}

/**
 * The PR's body, in the shape of `.github/pull_request_template.md`.
 * @param {{ n: number, message: string, spec: string, checked: string, reports: string[] }} task - what the task has.
 * @returns {string} the body.
 */
export function prBody({ n, message, spec, checked, reports }) {
  return [
    `Closes #${n}`,
    '',
    '## Summary',
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
    `**Door:** ${section(spec, '## Door')}`,
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
  ].join('\n')
}

/**
 * The comment of one review report. Its first line names the report, so a
 * second `task land` finds it on the PR and does not post it again.
 * @param {string} file - the report's file name.
 * @param {string} text - the report.
 * @returns {string} the comment.
 */
export function reportComment(file, text) {
  return `${marker(file)}\n<details><summary>${file}</summary>\n\n${text.trim()}\n\n</details>\n`
}

/**
 * The first line of a report's comment.
 * @param {string} file - the report's file name.
 * @returns {string} the line.
 */
export function marker(file) {
  return `<!-- binnacle-report: ${file} -->`
}
