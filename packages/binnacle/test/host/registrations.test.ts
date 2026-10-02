import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { stripTerminalSequences } from '@earendil-works/pi-tui'
import type { KeyId } from '@earendil-works/pi-tui'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { adapt } from '../../src/facts/adapt.ts'
import type { AffordanceKind, Fact, Node, Placement } from '../../src/api.ts'
import { RegistrationService } from '../../src/host/registrations.ts'
import { ScreenPane } from '../../src/panes/screen.ts'
import { TranscriptPane } from '../../src/panes/transcript.ts'
import { drawText } from '../support/draw.ts'
import { initial } from '../../src/ui/state.ts'
import { screen } from '../../src/views/screen.ts'
import { prompt as promptFact, call, returned } from '../support/facts.ts'
import { called, seed as seedEvent } from '../support/events.ts'
import { pointer } from '../support/pointer.ts'
import { foldedAlike } from '../support/views.ts'
import { mocha, rgb } from '../support/palettes.ts'

const prompt = promptFact(1, 1, 'fix the build')
const seed = seedEvent(2, 2)

/**
 * The surface's registrations on a real context, and a way to mount an author's plugin on it.
 * @returns the registrations and the author mounter.
 */
function surface() {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  const author = async (apply: (ctx: Context) => void) => {
    const fiber = ctx.plugin({ name: 'author', inject: ['binnacle'], apply })
    await fiber
    return fiber
  }
  return { registrations, author }
}

/**
 * What the screen shows with the registrations as they stand.
 * @param registrations - the service.
 * @param events - the session's events, beyond the prompt.
 * @returns its lines, plain.
 */
const shown = (registrations: RegistrationService, ...events: SessionEvent[]): string[] => {
  const facts = [prompt, ...events.map((event) => adapt(event, registrations.adapters))]
  return screen(facts, initial, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
    stripTerminalSequences(line).trimEnd(),
  )
}

test("an author's view replaces a built-in one, until the author's plugin is disposed", async () => {
  const { registrations, author } = surface()
  const fiber = await author((ctx) => {
    ctx.binnacle.view('prompt', (entry) => ({ kind: 'text', text: `ME: ${entry.kind === 'prompt' ? entry.fact.blocks.length : 0} block` }))
  })
  assert.deepEqual(shown(registrations), ['ME: 1 block'])
  await fiber.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

test("an author's view of thinking draws an answer already on screen again, its thinking alone, until the author's plugin is disposed", async () => {
  const { registrations, author } = surface()
  const pane = new TranscriptPane(
    () => {},
    () => registrations.views,
    {},
    () => registrations.currentTheme,
  )
  pane.push({
    kind: 'answer',
    seq: 2,
    time: 2,
    turn: 1,
    step: 1,
    provider: 'deepseek',
    model: 'deepseek-v4',
    interrupted: false,
    blocks: [
      { kind: 'reasoning', text: 'check tsc' },
      { kind: 'text', text: 'Fixed.' },
    ],
  })
  assert.deepEqual(drawText(pane, 40), ['∴ thinking · 1 line', 'Fixed.'])
  const fiber = await author((ctx) => {
    ctx.binnacle.view('thinking', (part) => ({ kind: 'text', text: `(${part.text})` }))
  })
  assert.deepEqual(drawText(pane, 40), ['(check tsc)', 'Fixed.'])
  await fiber.dispose()
  assert.deepEqual(drawText(pane, 40), ['∴ thinking · 1 line', 'Fixed.'])
})

test("an author's theme draws a mark in its own glyph, until the author's plugin is disposed", async () => {
  const { registrations, author } = surface()
  const fiber = await author((ctx) => {
    ctx.binnacle.theme({ marks: { prompt: { glyph: '>' } } })
  })
  assert.deepEqual(shown(registrations), ['', ' > fix the build', ''])
  await fiber.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

test("the transcript pane draws in the theme an author registers, and in binnacle's once it is disposed", async () => {
  const { registrations, author } = surface()
  const pane = new TranscriptPane(
    () => {},
    () => registrations.views,
    {},
    () => registrations.currentTheme,
  )
  pane.push(prompt)
  const lines = () => pane.render(40).map((line) => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(), ['', ' › fix the build', ''])
  const fiber = await author((ctx) => {
    ctx.binnacle.theme({ marks: { prompt: { glyph: '>' } } })
  })
  assert.deepEqual(lines(), ['', ' > fix the build', ''])
  await fiber.dispose()
  assert.deepEqual(lines(), ['', ' › fix the build', ''])
})

test("a view may name a tone its author's theme adds, drawn in the colour the theme gives it", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { highlight: { color: 'magenta' } } })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'asked', tone: 'highlight' }))
  })
  const facts = [prompt]
  assert.deepEqual(screen(facts, initial, 10, registrations.views, registrations.currentTheme).lines, ['\x1b[35masked\x1b[39m     '])
})

test('a tone may be any colour: one of the sixteen, a 256-colour index, hex, or okhsl, drawn exactly', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({
      tones: { sixteen: { color: 'red' }, indexed: { color: 208 }, hex: { color: '#ff8800' }, okhsl: { color: 'okhsl(0 0% 100%)' } },
    })
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: ['sixteen', 'indexed', 'hex', 'okhsl'].map((tone) => ({ kind: 'text' as const, text: tone, tone })),
    }))
  })
  assert.deepEqual(screen([prompt], initial, 7, registrations.views, registrations.currentTheme).lines, [
    '\x1b[31msixteen\x1b[39m',
    '\x1b[38;5;208mindexed\x1b[39m',
    '\x1b[38;2;255;136;0mhex\x1b[39m    ',
    '\x1b[38;2;255;255;255mokhsl\x1b[39m  ',
  ])
})

test('a tone may carry a background, of any colour, drawn behind its colour', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { code: { color: 'yellow', background: '#303030' }, band: { background: 'blue' } } })
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: [
        { kind: 'text', text: 'code', tone: 'code' },
        { kind: 'text', text: 'band', tone: 'band' },
      ],
    }))
  })
  assert.deepEqual(screen([prompt], initial, 4, registrations.views, registrations.currentTheme).lines, [
    '\x1b[48;2;48;48;48m\x1b[33mcode\x1b[39m\x1b[49m',
    '\x1b[44mband\x1b[49m',
  ])
})

test('a theme may name a colour once among its variables and give it by name, to a tone, its background, or a background', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({
      vars: { brand: '#ff8800', ink: 'black' },
      tones: { code: { color: 'brand', background: 'ink' } },
    })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'code', tone: 'code' }))
  })
  assert.deepEqual(screen([prompt], initial, 4, registrations.views, registrations.currentTheme).lines, [
    '\x1b[40m\x1b[38;2;255;136;0mcode\x1b[39m\x1b[49m',
  ])
})

test("markdown is drawn in pi's markdown tokens, so recolouring inline code leaves the warning tone it once borrowed", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { mdCode: { color: 'red' } } })
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: [
        { kind: 'markdown', text: 'run `tsc`' },
        { kind: 'text', text: 'careful', tone: 'warning' },
      ],
    }))
  })
  assert.deepEqual(screen([prompt], initial, 9, registrations.views, registrations.currentTheme).lines, [
    'run \x1b[31mtsc\x1b[39m  ',
    '\x1b[33mcareful\x1b[39m  ',
  ])
})

test("a theme's light and dark variants lay over it as the terminal's appearance is light or dark, and neither while it is unknown", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({
      tones: { accent: { color: 'red' } },
      dark: { tones: { accent: { color: 'blue' } } },
      light: { tones: { accent: { color: 'green' } } },
    })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'a', tone: 'accent' }))
  })
  const drawn = () => screen([prompt], initial, 1, registrations.views, registrations.currentTheme).lines
  assert.deepEqual(drawn(), ['\x1b[31ma\x1b[39m'])
  registrations.drawOn({ appearance: 'dark', mode: 'truecolor' })
  assert.deepEqual(drawn(), ['\x1b[34ma\x1b[39m'])
  registrations.drawOn({ appearance: 'light', mode: 'truecolor' })
  assert.deepEqual(drawn(), ['\x1b[32ma\x1b[39m'])
})

test('on a terminal of 256 colours, an exact colour is drawn as the nearest of them, as pi-tui draws it', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { accent: { color: '#ff8800', background: '#ff8800' } } })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'a', tone: 'accent' }))
  })
  registrations.drawOn({ mode: '256color' })
  assert.deepEqual(screen([prompt], initial, 1, registrations.views, registrations.currentTheme).lines, [
    '\x1b[48;5;208m\x1b[38;5;208ma\x1b[39m\x1b[49m',
  ])
})

test("binnacle's own theme takes its colours from the palette a terminal reports, under what an author's theme gives, and its sixteen where the terminal reports nothing", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: [
        { kind: 'text', text: 'a', tone: 'accent' },
        { kind: 'markdown', text: '# h' },
      ],
    }))
  })
  const drawn = () => screen([prompt], initial, 3, registrations.views, registrations.currentTheme).lines.map((line) => line.trimEnd())
  registrations.drawOn({
    mode: 'truecolor',
    appearance: 'dark',
    reported: { background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4'), palette: mocha },
  })
  assert.deepEqual(drawn(), [
    '\x1b[38;2;232;104;205ma\x1b[39m',
    '\x1b[38;2;193;154;59m\x1b[1m\x1b[1m\x1b[4mh\x1b[24m\x1b[22m\x1b[22m\x1b[39m',
  ])
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { accent: { color: 'red' } } })
  })
  assert.equal(drawn()[0], '\x1b[31ma\x1b[39m')
  registrations.drawOn({ mode: 'truecolor', appearance: 'dark', reported: {} })
  assert.deepEqual(drawn(), ['\x1b[31ma\x1b[39m', '\x1b[1m\x1b[1m\x1b[4mh\x1b[24m\x1b[22m\x1b[22m'])
})

test("ordinary prose is drawn in pi's text token, a markdown answer's and a view's untoned text alike", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { text: { color: 'red' } } })
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: [
        { kind: 'markdown', text: 'ordinary prose' },
        { kind: 'text', text: 'plain' },
        { kind: 'text', text: 'warned', tone: 'warning' },
      ],
    }))
  })
  assert.deepEqual(
    screen([prompt], initial, 14, registrations.views, registrations.currentTheme).lines.map((line) => line.trimEnd()),
    ['\x1b[31mordinary prose\x1b[39m', '\x1b[31mplain\x1b[39m', '\x1b[33mwarned\x1b[39m'],
  )
})

test("a variable may name another, before or after it, as pi's themes do, and one that names itself through others is refused", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ vars: { brand: 'ink', ink: 'base', base: '#ff0000' }, tones: { accent: { color: 'brand' } } })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'a', tone: 'accent' }))
  })
  assert.deepEqual(screen([prompt], initial, 1, registrations.views, registrations.currentTheme).lines, ['\x1b[38;2;255;0;0ma\x1b[39m'])
  assert.throws(() => registrations.theme({ vars: { a: 'b', b: 'a' } }), {
    message: 'binnacle.theme: vars.a names itself, through b',
  })
})

test('a variant may name a tone or change a mark its own theme adds beneath it', async () => {
  const { registrations } = surface()
  registrations.theme({
    tones: { brand: { color: 'red' } },
    marks: { pinned: { glyph: '*', tone: 'brand' } },
    light: { marks: { prompt: { tone: 'brand' }, pinned: { glyph: '+' } } },
  })
  registrations.drawOn({ mode: 'truecolor', appearance: 'light' })
  assert.deepEqual(registrations.currentTheme.marks.prompt, { glyph: '›', tone: 'brand' })
  assert.deepEqual(registrations.currentTheme.marks.pinned, { glyph: '+', tone: 'brand' })
})

test('a theme that names what binnacle cannot draw is refused where it is registered, saying what to change', () => {
  const { registrations } = surface()
  assert.throws(() => registrations.theme({ tones: { accent: { color: 'purple' } } } as never), {
    message:
      'binnacle.theme: tones.accent.color is "purple", not a colour: one of the terminal\'s sixteen (black, red, green, yellow, blue, magenta, cyan, white, bright-black, bright-red, bright-green, bright-yellow, bright-blue, bright-magenta, bright-cyan, bright-white), a 256-colour index from 0 to 255, #rrggbb, okhsl(h s% l%), oklch(l c h), or a name among the theme\'s vars',
  })
  assert.throws(() => registrations.theme({ dark: { tones: { accent: { color: 'purple' } } } }), {
    message: /^binnacle\.theme: dark\.tones\.accent\.color is "purple", not a colour/,
  })
  assert.throws(() => registrations.theme({ light: { dark: {} } } as never), {
    message: 'binnacle.theme: light.dark is no part of a variant, which holds no variant of its own',
  })
  assert.throws(() => registrations.theme({ tones: { accent: { color: 256 } } }), {
    message: /^binnacle\.theme: tones\.accent\.color is 256, not a colour/,
  })
  assert.throws(() => registrations.theme({ tones: { accent: { color: '#ff88' } } }), {
    message: /^binnacle\.theme: tones\.accent\.color is "#ff88", not a colour/,
  })
  assert.throws(() => registrations.theme({ marks: { pinned: { glyph: '★' } } }), {
    message: 'binnacle.theme: marks.pinned is a mark the theme has none of, so it needs a glyph and a tone',
  })
  assert.throws(() => registrations.theme({ words: { cut: 3 } } as never), { message: 'binnacle.theme: words.cut is 3, not a string' })
  assert.throws(() => registrations.theme({ folds: { tool: { rows: -1 } } }), {
    message: 'binnacle.theme: folds.tool.rows is -1, not a whole number of rows',
  })
  assert.throws(() => registrations.theme({ marks: { prompt: { glyph: '\x1b[2J' } } }), {
    message: 'binnacle.theme: marks.prompt.glyph holds a control character, which would reach the terminal as one',
  })
  assert.throws(() => registrations.theme({ words: { less: 'less\x07' } }), {
    message: 'binnacle.theme: words.less holds a control character, which would reach the terminal as one',
  })
  assert.throws(() => registrations.theme({ chrome: { border: { side: '||' } } }), {
    message: 'binnacle.theme: chrome.border.side is "||", not one column wide',
  })
  assert.throws(() => registrations.theme({ marks: { pinned: { glyph: '★', tone: 'nope' } } }), {
    message: 'binnacle.theme: marks.pinned.tone is "nope", a tone the theme does not give',
  })
})

test('a fold its view leaves unsized shows the rows the theme gives its kind, or three', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'fold', id: 'f', child: { kind: 'text', text: 'a\nb\nc\nd\ne' } }))
  })
  assert.deepEqual(shown(registrations), ['a', 'b', 'c', '… 2 more lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { prompt: { rows: 1 } } })
  })
  assert.deepEqual(shown(registrations), ['a', '… 4 more lines'])
})

test("a theme says how many rows a kind's built-in folds show, without a view redrawn", async () => {
  const { registrations, author } = surface()
  const reasoning: Fact = {
    kind: 'answer',
    seq: 2,
    time: 2,
    turn: 1,
    step: 1,
    provider: 'p',
    model: 'm',
    interrupted: false,
    blocks: [{ kind: 'reasoning', text: 'a\nb\nc' }],
  }
  const lines = () =>
    screen([reasoning], initial, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(), ['∴ thinking · 3 lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { answer: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['∴ thinking', 'a', '… 2 more lines'])
})

test("a theme says how many rows the context fold shows, as the thinking fold's", async () => {
  const { registrations, author } = surface()
  const context: Fact = { kind: 'context', seq: 2, time: 2, source: 'goal', blocks: [{ kind: 'text', text: 'a\nb\nc' }] }
  const lines = () =>
    screen([context], initial, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(), ['⋯ added by goal · 3 lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { context: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['⋯ added by goal', 'a', '… 2 more lines'])
})

test("a theme says how many rows a tool's output fold shows", async () => {
  const { registrations, author } = surface()
  const facts: Fact[] = [call(2, 2, 'c1', 'bash', '{}'), returned(3, 3, 'c1', 'a\nb\nc\nd\ne')]
  const lines = () =>
    screen(facts, initial, 40, registrations.views, registrations.currentTheme).lines.map((line) => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(), ['● bash {}', '│ a', '│ b', '│ c', '│ … 2 more lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { tool: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['● bash {}', '│ a', '│ … 4 more lines'])
})

test('a theme says how many rows the fold of a result no call claims shows', async () => {
  const { registrations, author } = surface()
  const lines = () =>
    screen([returned(2, 2, 'c9', 'a\nb\nc\nd\ne')], initial, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(), ['● result of call c9', 'a', 'b', 'c', '… 2 more lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { result: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['● result of call c9', 'a', '… 4 more lines'])
})

test("a theme says how many rows the fallback's fold of a kind nothing draws shows", async () => {
  const { registrations, author } = surface()
  const marker: Fact = { kind: 'unknown', seq: 2, time: 2, type: 'goal/change', record: { type: 'goal/change', data: {} } }
  const lines = () =>
    screen([marker], initial, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(), ['? goal/change · 4 lines'])
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { unknown: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['? goal/change', '{', '… 3 more lines'])
})

test("an authored fact's fallback fold starts as the theme gives its name, falling back to its kind", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: { one: 'a', two: 'b', three: 'c', four: 'd', five: 'e' } }))
  })
  const lines = () => shown(registrations, seed).slice(4)
  assert.deepEqual(lines(), ['? seeded · 7 lines'])
  const kind = await author((ctx) => {
    ctx.binnacle.theme({ folds: { authored: { rows: 2 } } })
  })
  assert.deepEqual(lines(), ['? seeded', '{', '  "one": "a",', '… 5 more lines'])
  const named = await author((ctx) => {
    ctx.binnacle.theme({ folds: { seeded: { rows: 1 } } })
  })
  assert.deepEqual(lines(), ['? seeded', '{', '… 6 more lines'])
  await kind.dispose()
  assert.deepEqual(lines(), ['? seeded', '{', '… 6 more lines'], "the name's start still wins with the kind's gone")
  await named.dispose()
  assert.deepEqual(lines(), ['? seeded · 7 lines'], 'disposing both gives the authored kind back its own start')
})

test("a theme may start the thinking fold open, and a person's toggle folds it back", async () => {
  const { registrations, author } = surface()
  const reasoning: Fact = {
    kind: 'answer',
    seq: 2,
    time: 2,
    turn: 1,
    step: 1,
    provider: 'p',
    model: 'm',
    interrupted: false,
    blocks: [{ kind: 'reasoning', text: 'a\nb\nc' }],
  }
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { answer: { open: true } } })
  })
  const lines = (toggled: ReadonlySet<string>) =>
    screen([reasoning], { toggled }, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(new Set()), ['∴ thinking · show less', 'a', 'b', 'c'])
  assert.deepEqual(lines(new Set(['2/reasoning-0'])), ['∴ thinking · 3 lines'])
})

test("thinking is drawn in pi's thinkingText token, so recolouring it leaves the dim tone it once borrowed", async () => {
  const { registrations, author } = surface()
  const reasoning: Fact = {
    kind: 'answer',
    seq: 2,
    time: 2,
    turn: 1,
    step: 1,
    provider: 'p',
    model: 'm',
    interrupted: true,
    blocks: [{ kind: 'reasoning', text: 'a' }],
  }
  await author((ctx) => {
    ctx.binnacle.theme({ folds: { answer: { open: true } }, tones: { thinkingText: { color: 'red' } } })
  })
  const lines = screen([reasoning], initial, 40, registrations.views, registrations.currentTheme).lines.map((line) => line.trimEnd())
  assert.equal(lines[1], '\x1b[31ma\x1b[39m')
  assert.equal(lines[2], '\x1b[2m(interrupted)\x1b[22m')
})

test("a prompt's band is filled with pi's userMessageBg and its words drawn in userMessageText", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ backgrounds: { userMessageBg: 'blue' }, tones: { userMessageText: { color: 'white' } } })
  })
  const lines = screen([prompt], initial, 20, registrations.views, registrations.currentTheme).lines
  assert.ok(lines[1]?.startsWith('\x1b[44m'), `the band is blue: ${JSON.stringify(lines[1])}`)
  assert.ok(lines[1]?.includes('\x1b[37m fix the build\x1b[39m'), `its words are white: ${JSON.stringify(lines[1])}`)
})

test("an ask's frame is drawn in pi's border token and a show's gutter in borderMuted, leaving the dim tone they once borrowed", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { border: { color: 'red' }, borderMuted: { color: 'blue' } } })
    ctx.binnacle.view('prompt', () => ({
      kind: 'stack',
      children: [
        { kind: 'ask', child: { kind: 'text', text: 'x' } },
        { kind: 'show', title: ['t'], child: { kind: 'text', text: 'y' } },
        { kind: 'text', text: 'z', tone: 'dim' },
      ],
    }))
  })
  const lines = screen([prompt], initial, 5, registrations.views, registrations.currentTheme).lines.map((line) => line.trimEnd())
  assert.deepEqual(lines, [
    '\x1b[31m╭───╮\x1b[39m',
    '\x1b[31m│\x1b[39m x \x1b[31m│\x1b[39m',
    '\x1b[31m╰───╯\x1b[39m',
    't',
    '\x1b[34m│\x1b[39m y',
    '\x1b[2mz\x1b[22m',
  ])
})

test('a theme registration draws and lays out every entry again, so an author changes no view of their own for it', async () => {
  const { registrations, author } = surface()
  let calls = 0
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => {
      calls++
      return { kind: 'text', text: 'one' }
    })
  })
  const pane = new TranscriptPane(
    () => {},
    () => registrations.views,
    {},
    () => registrations.currentTheme,
  )
  pane.push(prompt)
  const lines = () => pane.render(40).map((line) => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(), ['one'])
  assert.equal(calls, 1)
  await author((ctx) => {
    ctx.binnacle.theme({ tones: { accent: { color: 'cyan' } } })
  })
  assert.deepEqual(lines(), ['one'])
  assert.equal(calls, 2)
})

test("a kind whose folds the theme starts open draws them open, and a person's toggle folds one", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'fold', id: 'f', rows: 1, child: { kind: 'text', text: 'a\nb\nc' } }))
    ctx.binnacle.theme({ folds: { prompt: { open: true } } })
  })
  const lines = (toggled: ReadonlySet<string>) =>
    screen([prompt], { toggled }, 40, registrations.views, registrations.currentTheme).lines.map((line) =>
      stripTerminalSequences(line).trimEnd(),
    )
  assert.deepEqual(lines(new Set()), ['a', 'b', 'c'])
  assert.deepEqual(lines(new Set(['1/f'])), ['a', '… 2 more lines'])
})

test('a theme may change in part a mark an earlier theme added, keeping what it leaves out', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.theme({ marks: { pinned: { glyph: '★', tone: 'warning' } } })
    ctx.binnacle.theme({ marks: { pinned: { glyph: '◆' } } })
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: [{ mark: 'pinned' }] }))
  })
  assert.deepEqual(screen([prompt], initial, 4, registrations.views, registrations.currentTheme).lines, ['\x1b[33m◆\x1b[39m   '])
})

/**
 * A pane on the registrations as they stand, holding two prompts an author's view folds alike, and its lines.
 * @param registrations - the surface's registrations.
 * @returns the pane, and its lines at width 40.
 */
function alikePane(registrations: RegistrationService): { pane: TranscriptPane; lines: () => string[] } {
  const pane = new TranscriptPane(
    () => {},
    () => registrations.views,
  )
  pane.push(promptFact(1, 1, 'one\nmore'))
  pane.push(promptFact(2, 2, 'two\nmore'))
  return { pane, lines: () => pane.render(40).map((line) => stripTerminalSequences(line).trimEnd()) }
}

test("an author's view that names one fold in every entry opens only the fold a person clicked", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', foldedAlike)
  })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  assert.deepEqual(pane.handleMouse(pointer('click', 4)), { handled: true })
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', 'more'])
})

test("enter on the fold a person focused opens only that entry's, wherever its name is shared", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', foldedAlike)
  })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'focus.previous' }), true)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '▸ show 1 more line'])
  assert.equal(pane.handleKey({ kind: 'key', binding: 'primary' }), true)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', 'more', '▸ fold to 1 line'])
})

test("focus moves through each entry's regions in turn, where two entries name theirs alike", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', foldedAlike)
  })
  const { pane, lines } = alikePane(registrations)
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '… 1 more line'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(lines(), ['one', '… 1 more line', '', 'two', '▸ show 1 more line'])
  pane.handleKey({ kind: 'key', binding: 'focus.previous' })
  assert.deepEqual(lines(), ['one', '▸ show 1 more line', '', 'two', '… 1 more line'])
})

test("an author's adapter turns an event kind into a fact of their own, which their view draws", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: { from: 'fork' } }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: '— seeded from a fork —' }))
  })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', '— seeded from a fork —'])
})

test("a fact of the author's own with no view is drawn by the fallback, by its name, never dropped", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: { from: 'fork' } }))
  })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', '? seeded · 3 lines'])
})

test('the newest plugin to draw a key draws it, on what the one before drew, and disposing either gives its place back', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' }))
  })
  const second = await author((ctx) => {
    ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: 'second' }] }))
  })
  assert.deepEqual(shown(registrations), ['first', 'second'])
  await first.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', '', 'second'])
  await second.dispose()
  assert.deepEqual(shown(registrations), ['', ' › fix the build', ''])
})

test("an author's view may name a mark, and the theme draws its glyph in the mark's tone", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: [{ mark: 'failed' }, ' the build'] }))
  })
  assert.deepEqual(shown(registrations), ['✗ the build'])
  const raw = screen([prompt], initial, 40, registrations.views).lines.map((line) => line.trimEnd())
  assert.equal(raw[0], '\x1b[31m✗\x1b[39m the build')
})

test("an author's view naming a mark the theme has not is drawn by the view beneath, which names the mark", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: [{ mark: 'shrug' }, ' the build'] }) as unknown as Node)
  })
  assert.deepEqual(shown(registrations), [
    '',
    ' › fix the build',
    '',
    '✗ binnacle.view(prompt) returned no',
    'drawable node: shrug is no mark',
  ])
})

test('a view that throws is drawn over by the view beneath it, which says whose view failed and why', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => ({ kind: 'text', text: 'first' }))
  })
  await author((ctx) => {
    ctx.binnacle.view('prompt', () => {
      throw new Error('no phone')
    })
  })
  assert.deepEqual(shown(registrations), ['first', '✗ binnacle.view(prompt) threw: no phone'])
})

test('the newest adapter of a kind reads it, and disposing it gives the kind back to the one before', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'seeded', data: {} }))
    ctx.binnacle.view('seeded', () => ({ kind: 'text', text: 'seeded' }))
  })
  const forked = await author((ctx) => {
    ctx.binnacle.facts('test/marker', () => ({ name: 'forked', data: {} }))
    ctx.binnacle.view('forked', () => ({ kind: 'text', text: 'forked' }))
  })
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', 'forked'])
  await forked.dispose()
  assert.deepEqual(shown(registrations, seed), ['', ' › fix the build', '', '', 'seeded'])
})

test('a view is handed what the view beneath it draws, and builds on it', async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('prompt', (_, next) => ({ kind: 'stack', children: [next(), { kind: 'text', text: '  sent from the phone' }] }))
  })
  assert.deepEqual(shown(registrations), ['', ' › fix the build', '', '  sent from the phone'])
})

test("two plugins can each draw one tool's card, and every other card stays binnacle's", async () => {
  const { registrations, author } = surface()
  await author((ctx) => {
    ctx.binnacle.view('tool', (entry, next) =>
      entry.kind === 'tool' && entry.call.name === 'bash' ? { kind: 'text', text: '$ make' } : next(),
    )
  })
  await author((ctx) => {
    ctx.binnacle.view('tool', (entry, next) =>
      entry.kind === 'tool' && entry.call.name === 'read' ? { kind: 'text', text: 'read a file' } : next(),
    )
  })
  assert.deepEqual(shown(registrations, called(2, 'bash'), called(3, 'read'), called(4, 'grep')), [
    '',
    ' › fix the build',
    '',
    '',
    '$ make',
    '',
    'read a file',
    '',
    '● grep {}',
    '│ running 0s',
  ])
})

test("a view that read something besides its entry invalidates its key, and only that key's entries are drawn again", async () => {
  const { registrations, author } = surface()
  let marker = '›'
  let calls = 0
  await author((ctx) => {
    ctx.binnacle.view('prompt', (entry) => ({ kind: 'text', text: `${marker} ${entry.kind === 'prompt' ? entry.fact.seq : 0}` }))
    ctx.binnacle.view('context', (_, next) => {
      calls++
      return next()
    })
  })
  const pane = new TranscriptPane(
    () => {},
    () => registrations.views,
  )
  pane.push(prompt)
  pane.push({ kind: 'context', seq: 2, time: 2, source: 'goal', blocks: [{ kind: 'text', text: 'ship it' }] })
  const lines = () => pane.render(40).map((line) => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(), ['› 1', '', '⋯ added by goal · 1 line'])
  marker = '»'
  assert.deepEqual(lines(), ['› 1', '', '⋯ added by goal · 1 line'])
  registrations.invalidate('prompt')
  assert.deepEqual(lines(), ['» 1', '', '⋯ added by goal · 1 line'])
  assert.equal(calls, 1)
})

test('a plugin places a screen, read back as lines, and disposing its plugin takes it back', async () => {
  const { registrations, author } = surface()
  const changes: string[] = []
  registrations.onChange((changed) => {
    changes.push(changed)
  })
  const fiber = await author((ctx) => {
    ctx.binnacle.screen('trajectory', { key: 'f2', description: 'open the trajectory', draw: () => ({ kind: 'text', text: 'the turns' }) })
  })
  assert.deepEqual(changes, ['screens'])
  const placed = registrations.screens.get('trajectory')
  assert.equal(placed?.key, 'f2')
  const pane = new ScreenPane(() => [prompt])
  pane.place('trajectory', placed ?? { draw: () => ({ kind: 'blank' }) })
  assert.deepEqual(
    pane.render(40).map((line) => stripTerminalSequences(line).trimEnd()),
    ['the turns'],
  )
  await fiber.dispose()
  assert.equal(registrations.screens.has('trajectory'), false)
})

test('the newest plugin to place a name places it, and disposing it gives the name back', async () => {
  const { registrations, author } = surface()
  const first = await author((ctx) => {
    ctx.binnacle.screen('trajectory', { key: 'f2', description: 'first', draw: () => ({ kind: 'text', text: 'first' }) })
  })
  await author((ctx) => {
    ctx.binnacle.screen('trajectory', { key: 'f3', description: 'second', draw: () => ({ kind: 'text', text: 'second' }) })
  })
  assert.equal(registrations.screens.get('trajectory')?.description, 'second')
  await first.dispose()
  assert.equal(registrations.screens.get('trajectory')?.description, 'second')
  const fiber = await author((ctx) => {
    ctx.binnacle.screen('trajectory', { key: 'f3', description: 'second', draw: () => ({ kind: 'text', text: 'second' }) })
  })
  await fiber.dispose()
  assert.equal(registrations.screens.get('trajectory')?.description, 'second', 'disposing one of two alike gives the other back')
})

/** Lines naming the model, as a status line draws them. */
const modelLine = (): Node => ({ kind: 'text', text: 'deepseek/deepseek-v4' })

test('a plugin places lines below the composer, and disposing its plugin takes them back', async () => {
  const { registrations, author } = surface()
  const changes: string[] = []
  registrations.onChange((changed) => {
    changes.push(changed)
  })
  const fiber = await author((ctx) => {
    ctx.binnacle.place('below-composer', { kind: 'lines', draw: modelLine })
  })
  assert.deepEqual(changes, ['placements'])
  assert.deepEqual(registrations.placed('below-composer'), [{ kind: 'lines', draw: modelLine }])
  await fiber.dispose()
  assert.deepEqual(registrations.placed('below-composer'), [])
})

test("a transcript or composer placed outside its own slot, or lines in the transcript's place, is refused, saying what to change", () => {
  const { registrations } = surface()
  assert.throws(() => registrations.place('below-composer', { kind: 'composer', submit: () => {} }), {
    message: 'binnacle.place(below-composer): the composer goes only in the composer slot',
  })
  assert.throws(() => registrations.place('composer', { kind: 'transcript' }), {
    message: 'binnacle.place(composer): the transcript goes only in the transcript slot',
  })
  assert.throws(() => registrations.place('transcript', { kind: 'lines', draw: () => ({ kind: 'blank' }) }), {
    message: "binnacle.place(transcript): lines cannot take the transcript's place; place a screen there with binnacle.screen",
  })
  assert.deepEqual(
    [registrations.placed('below-composer'), registrations.placed('composer'), registrations.placed('transcript')],
    [[], [], []],
  )
})

test('a slot or a placement binnacle has not is refused, naming what it has', () => {
  const { registrations } = surface()
  assert.throws(() => registrations.place('footer' as never, { kind: 'lines', draw: () => ({ kind: 'blank' }) }), {
    message: 'binnacle.place(footer): no such slot; the slots are transcript, above-composer, composer, below-composer and dialog',
  })
  assert.throws(() => registrations.place('below-composer', { kind: 'status' } as never), {
    message:
      "binnacle.place(below-composer): a placement is { kind: 'transcript' }, { kind: 'composer', submit } or { kind: 'lines', draw }, each a function",
  })
  assert.throws(() => registrations.place('below-composer', { kind: 'lines' } as never), {
    message:
      "binnacle.place(below-composer): a placement is { kind: 'transcript' }, { kind: 'composer', submit } or { kind: 'lines', draw }, each a function",
  })
  assert.throws(() => registrations.place('composer', { kind: 'composer' } as never), {
    message:
      "binnacle.place(composer): a placement is { kind: 'transcript' }, { kind: 'composer', submit } or { kind: 'lines', draw }, each a function",
  })
})

test('a plugin rebinds a key, the newest registration of a binding wins, and disposing each gives back what was beneath it', async () => {
  const { registrations, author } = surface()
  const changes: string[] = []
  registrations.onChange((changed) => {
    changes.push(changed)
  })
  const first = await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.quit': 'ctrl+q', 'binnacle.copy': 'ctrl+y' })
  })
  const second = await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.quit': ['ctrl+w', 'f10'] })
  })
  assert.deepEqual(changes, ['keys', 'keys'])
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': ['ctrl+w', 'f10'], 'binnacle.copy': 'ctrl+y' })
  await second.dispose()
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': 'ctrl+q', 'binnacle.copy': 'ctrl+y' })
  await first.dispose()
  assert.deepEqual(registrations.bindings, {})
})

test('a registration keeps the bindings as they were handed over: the object changing later, or an array in it, changes nothing', async () => {
  const { registrations, author } = surface()
  const given: { 'binnacle.quit': KeyId[] } = { 'binnacle.quit': ['ctrl+q'] }
  await author((ctx) => {
    ctx.binnacle.keys(given)
  })
  given['binnacle.quit'].push('ctrl+w')
  await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.copy': 'ctrl+y' })
  })
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': ['ctrl+q'], 'binnacle.copy': 'ctrl+y' })
  given['binnacle.quit'] = ['ctrl+w', 'f10']
  await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.open': 'f2' })
  })
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': ['ctrl+q'], 'binnacle.copy': 'ctrl+y', 'binnacle.open': 'f2' })
})

test('disposing a registration takes back its own layer: a bindings object handed over twice, disposed, reveals the one between', async () => {
  const { registrations, author } = surface()
  const shared: { 'binnacle.quit': KeyId } = { 'binnacle.quit': 'ctrl+q' }
  await author((ctx) => {
    ctx.binnacle.keys(shared)
  })
  await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.quit': 'ctrl+w' })
  })
  const again = await author((ctx) => {
    ctx.binnacle.keys(shared)
  })
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': 'ctrl+q' })
  await again.dispose()
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': 'ctrl+w' })
})

test('a binding binnacle has not — an inherited name, or an own __proto__ dropped by a prototype setter, among them — a key that is no string, or two bindings sharing one key is refused where it is registered, saying what to change', async () => {
  const { registrations, author } = surface()
  assert.throws(() => registrations.keys({ 'binnacle.nope': 'ctrl+q' }), {
    message:
      "binnacle.keys: binnacle.nope is no binding; bind one pi-tui or binnacle has, a placed screen's binnacle.screen.<name>, or an affordance's binnacle.<kind>",
  })
  assert.throws(() => registrations.keys({ toString: 'ctrl+q' } as never), {
    message:
      "binnacle.keys: toString is no binding; bind one pi-tui or binnacle has, a placed screen's binnacle.screen.<name>, or an affordance's binnacle.<kind>",
  })
  assert.throws(() => registrations.keys(JSON.parse('{"__proto__":"ctrl+q"}') as never), {
    message:
      "binnacle.keys: __proto__ is no binding; bind one pi-tui or binnacle has, a placed screen's binnacle.screen.<name>, or an affordance's binnacle.<kind>",
  })
  assert.throws(() => registrations.keys({ 'binnacle.quit': 3 } as never), {
    message: 'binnacle.keys: binnacle.quit is bound to 3; bind it to a key as pi-tui names one, such as ctrl+q, or a list of them',
  })
  await author((ctx) => {
    ctx.binnacle.keys({ 'binnacle.quit': 'ctrl+q' })
  })
  assert.throws(() => registrations.keys({ 'binnacle.screen.trajectory': 'ctrl+q' }), {
    message: 'binnacle.keys: ctrl+q is bound to both binnacle.quit and binnacle.screen.trajectory; bind one of them to another key',
  })
  assert.deepEqual(registrations.bindings, { 'binnacle.quit': 'ctrl+q' })
})

test('a line sent before the session opens, or after it closes, is refused, saying so; one sent while it is open reaches it', () => {
  const { registrations } = surface()
  assert.throws(() => registrations.send('hello'), {
    message: 'binnacle.send: no session is open; a line can be sent once the session opens, and until it closes',
  })
  const sent: string[] = []
  const close = registrations.open({
    send: (text) => {
      sent.push(text)
    },
    command: async () => false,
    agent: {} as Agent,
  })
  registrations.send('hello')
  assert.deepEqual(sent, ['hello'])
  close()
  assert.throws(() => registrations.send('again'), {
    message: 'binnacle.send: no session is open; a line can be sent once the session opens, and until it closes',
  })
})

test("the agent on screen is handed as dsh's own once the session opens, and refused before it opens and after it closes, saying so", () => {
  const { registrations } = surface()
  const refused = {
    message: 'binnacle.agent: no session is open; the agent on screen can be read once the session opens, and until it closes',
  }
  assert.throws(() => registrations.agent(), refused)
  const agent = { options: { provider: 'deepseek', model: 'deepseek-v4' } } as unknown as Agent
  const close = registrations.open({ send: () => {}, command: async () => false, agent })
  assert.equal(registrations.agent(), agent)
  close()
  assert.throws(() => registrations.agent(), refused)
})

test('what is no record of binding ids is refused where it is registered, saying what to change', () => {
  const { registrations } = surface()
  assert.throws(() => registrations.keys(null as never), {
    message: "binnacle.keys: bindings is null; bind a record from binding ids to keys, such as { 'binnacle.quit': 'ctrl+q' }",
  })
  assert.throws(() => registrations.keys('ctrl+q' as never), {
    message: "binnacle.keys: bindings is ctrl+q; bind a record from binding ids to keys, such as { 'binnacle.quit': 'ctrl+q' }",
  })
  assert.deepEqual(registrations.bindings, {})
})

test('a line run as a command before the session opens is refused, saying so; while it is open it reaches the session, which says whether a command ran', async () => {
  const { registrations } = surface()
  await assert.rejects(registrations.command('/compact'), {
    message: 'binnacle.command: no session is open; a command can be run once the session opens, and until it closes',
  })
  const run: string[] = []
  const close = registrations.open({
    send: () => {},
    command: async (line) => {
      run.push(line)
      return line === '/compact'
    },
    agent: {} as Agent,
  })
  assert.equal(await registrations.command('/compact'), true)
  assert.equal(await registrations.command('/nothing'), false)
  assert.deepEqual(run, ['/compact', '/nothing'])
  close()
})

test('an author types what their lines are invoked with from the author API alone', () => {
  const heard: AffordanceKind[] = []
  const placement: Placement = {
    kind: 'lines',
    draw: () => ({ kind: 'blank' }),
    invoke: (_region, affordance) => {
      heard.push(affordance)
    },
  }
  if (placement.kind === 'lines') placement.invoke?.('reject', 'dismiss')
  assert.deepEqual(heard, ['dismiss'])
})

test('a theme changes the gutter a show is drawn along, one column wide as its border pieces are', () => {
  const { registrations } = surface()
  assert.throws(() => registrations.theme({ chrome: { gutter: '||' } }), {
    message: 'binnacle.theme: chrome.gutter is "||", not one column wide',
  })
  registrations.theme({ chrome: { gutter: '┃' } })
  assert.equal(registrations.currentTheme.chrome.gutter, '┃')
})
