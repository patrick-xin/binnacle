import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPresets } from './check-presets.mjs'

/** One preset declaration, as dsh's web bundle writes them. */
const declaration = (id, plugins) =>
  `- insert:\n    - id: preset-${id}\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: ${id}\n        order: 1\n        plugins:\n${plugins}`

/** A row of a preset's plugin list, indented to sit under `plugins`. */
const row = (lines) => lines.map((line) => `          ${line}`).join('\n')

const STANDARD = declaration(
  'standard',
  [
    row(['- id: persona', "  name: '@deepseek-ai/dsh-persona'"]),
    row(['- id: tool-bash', "  name: '@deepseek-ai/dsh-tool-bash'", "  disabled: !!js process.platform === 'win32'"]),
    row(['- id: skill-filesystem', "  name: '@deepseek-ai/dsh-skill-filesystem'"]),
    row(['- id: tool-plugin-manager', "  name: '@deepseek-ai/dsh-plugin-manager/tools'", '  disabled: true']),
  ].join('\n'),
)

/** binnacle's author preset: `standard`'s rows with the author's two rows changed. */
const AUTHOR = declaration(
  'author',
  [
    row(['- id: persona', "  name: '@deepseek-ai/dsh-persona'"]),
    row(['- id: tool-bash', "  name: '@deepseek-ai/dsh-tool-bash'", "  disabled: !!js process.platform === 'win32'"]),
    row([
      '- id: skill-filesystem',
      "  name: '@deepseek-ai/dsh-skill-filesystem'",
      '  config:',
      '    customSkillDirs:',
      "      - !!js process.getBuiltinModule('node:path').join('skills')",
    ]),
    row([
      '- id: tool-plugin-manager',
      "  name: '@deepseek-ai/dsh-plugin-manager/tools'",
      '  disabled: !!js "!ctx.get(\'profileContext\')"',
    ]),
  ].join('\n'),
)

/** A passing set: dsh's four presets and the author derived from them. */
const green = () => ({
  upstream: { 'standard.patch.yml': STANDARD, 'ptc.patch.yml': 'ptc\n', 'minimal.patch.yml': 'minimal\n', 'cordis.patch.yml': 'cordis\n' },
  copies: { 'standard.patch.yml': STANDARD, 'ptc.patch.yml': 'ptc\n', 'minimal.patch.yml': 'minimal\n', 'cordis.patch.yml': 'cordis\n' },
  author: AUTHOR,
})

test("copies that are dsh's presets byte for byte, and an author that is standard's rows, pass", () => {
  assert.deepEqual(checkPresets(green()), [])
})

test('a copy that drifted from dsh at the pin is named, so moving the pin brings the new copies along', () => {
  const drifted = green()
  drifted.copies['ptc.patch.yml'] = `${drifted.copies['ptc.patch.yml']}# a local edit\n`
  assert.deepEqual(checkPresets(drifted), [
    'presets/ptc.patch.yml differs from dsh at the pin (dsh:packages/bundle/web-app/presets/ptc.patch.yml); copy the file again',
  ])
})

test('a copy left out is named', () => {
  const missing = green()
  delete missing.copies['minimal.patch.yml']
  assert.deepEqual(checkPresets(missing), [
    'presets/minimal.patch.yml is not copied from dsh at the pin; copy it from dsh:packages/bundle/web-app/presets/minimal.patch.yml',
  ])
})

test("an author row that left standard's is named with the row's id", () => {
  const left = green()
  left.author = left.author.replace("  name: '@deepseek-ai/dsh-persona'", "  name: '@deepseek-ai/dsh-other-persona'")
  assert.deepEqual(checkPresets(left), [
    "presets/author.patch.yml: row 1 persona is not standard's at the pin; rederive the author preset from presets/standard.patch.yml",
  ])
})

test("a row author added to standard's list is named", () => {
  const added = green()
  added.author = added.author.replace(
    '          - id: tool-plugin-manager',
    "          - id: tool-web\n            name: '@deepseek-ai/dsh-tool-web'\n          - id: tool-plugin-manager",
  )
  assert.deepEqual(checkPresets(added), [
    "presets/author.patch.yml holds 5 rows; standard's at the pin holds 4; rederive the author preset from presets/standard.patch.yml",
  ])
})

test("a row author dropped from standard's list is named", () => {
  const dropped = green()
  dropped.author = dropped.author.replace("          - id: persona\n            name: '@deepseek-ai/dsh-persona'\n", '')
  assert.deepEqual(checkPresets(dropped), [
    "presets/author.patch.yml holds 3 rows; standard's at the pin holds 4; rederive the author preset from presets/standard.patch.yml",
  ])
})

test("the author's skill-filesystem and plugin-manager rows may differ from standard's, and only those", () => {
  const onlyThose = green()
  onlyThose.author = AUTHOR.replace("      - !!js process.getBuiltinModule('node:path').join('skills')", '      - !!js null')
  assert.deepEqual(checkPresets(onlyThose), [])
})

test('an author that does not declare the author preset is named', () => {
  const renamed = green()
  renamed.author = renamed.author.replace('id: author\n', 'id: author2\n')
  assert.deepEqual(checkPresets(renamed), ['presets/author.patch.yml declares no preset named author; it is where the author preset lives'])
})
