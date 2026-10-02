import { colorToOkhsl, colorToOklch, oklabToOkhslLightness, okhslColor, rgbColor } from '@earendil-works/pi-tui'
import type { OkhslChannels, RgbColor, TerminalColorScheme, TerminalColors } from '@earendil-works/pi-tui'

/** The terminal's palette slots, 0-15. */
type PaletteSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

/** A hue a token's colour is drawn in: the range its saturation runs, and the palette slot it takes its hue from. */
interface Family {
  readonly hue: number
  readonly saturation: { readonly min: number; readonly max: number }
  readonly slot: PaletteSlot
}

const families = {
  neutral: { hue: 231.49, saturation: { min: 0.02, max: 0.08 }, slot: 8 },
  blue: { hue: 231.49, saturation: { min: 0.1, max: 0.68 }, slot: 4 },
  green: { hue: 158.68, saturation: { min: 0.1, max: 0.76 }, slot: 2 },
  red: { hue: 20, saturation: { min: 0.1, max: 0.92 }, slot: 1 },
  yellow: { hue: 82.36, saturation: { min: 0.5, max: 1 }, slot: 3 },
  orange: { hue: 52, saturation: { min: 0.12, max: 0.85 }, slot: 3 },
  violet: { hue: 295, saturation: { min: 0.2, max: 0.6 }, slot: 5 },
  calamine: { hue: 202.43, saturation: { min: 0.1, max: 0.74 }, slot: 6 },
  thinkingSlate: { hue: 231.49, saturation: { min: 0.08, max: 0.2 }, slot: 4 },
  thinkingBlue: { hue: 231.49, saturation: { min: 0.2, max: 0.45 }, slot: 4 },
  thinkingPeriwinkle: { hue: 263.25, saturation: { min: 0.3, max: 0.6 }, slot: 6 },
  thinkingViolet: { hue: 295, saturation: { min: 0.4, max: 0.75 }, slot: 5 },
  thinkingMagenta: { hue: 337.5, saturation: { min: 0.5, max: 0.85 }, slot: 13 },
  thinkingRed: { hue: 20, saturation: { min: 0.95, max: 1 }, slot: 1 },
} as const satisfies Record<string, Family>

type FamilyName = keyof typeof families

const tokenFamilies = {
  selectedBg: 'blue',
  searchMatchBg: 'orange',
  userMessageBg: 'blue',
  customMessageBg: 'violet',
  toolPendingBg: 'neutral',
  toolSuccessBg: 'green',
  toolErrorBg: 'red',

  text: 'neutral',
  userMessageText: 'neutral',
  customMessageText: 'neutral',
  toolTitle: 'neutral',
  syntaxOperator: 'neutral',
  syntaxPunctuation: 'neutral',
  muted: 'neutral',
  dim: 'neutral',
  thinkingText: 'neutral',
  toolOutput: 'neutral',
  mdLinkUrl: 'neutral',
  mdQuote: 'neutral',
  mdQuoteBorder: 'neutral',
  mdHr: 'neutral',
  mdCodeBlockBorder: 'neutral',
  toolDiffContext: 'neutral',
  syntaxComment: 'neutral',
  scrollbarTrack: 'neutral',
  scrollbarThumb: 'neutral',
  searchMatchText: 'neutral',
  borderMuted: 'neutral',

  accent: 'violet',
  borderAccent: 'violet',
  customMessageLabel: 'violet',
  mdCode: 'violet',
  mdListBullet: 'violet',
  syntaxType: 'violet',
  border: 'blue',
  mdLink: 'blue',
  syntaxKeyword: 'blue',
  syntaxVariable: 'calamine',
  success: 'green',
  mdCodeBlock: 'green',
  toolDiffAdded: 'green',
  bashMode: 'green',
  syntaxNumber: 'green',
  error: 'red',
  toolDiffRemoved: 'red',
  warning: 'yellow',
  mdHeading: 'yellow',
  syntaxFunction: 'yellow',
  syntaxString: 'orange',

  thinkingOff: 'neutral',
  thinkingMinimal: 'thinkingSlate',
  thinkingLow: 'thinkingBlue',
  thinkingMedium: 'thinkingPeriwinkle',
  thinkingHigh: 'thinkingViolet',
  thinkingXhigh: 'thinkingMagenta',
  thinkingMax: 'thinkingRed',
} as const satisfies Record<string, FamilyName>

/** A colour of the theme's, in pi's names. */
export type ThemeToken = keyof typeof tokenFamilies

/** Palette slots for tokens that would otherwise share a hue with a similar token. */
const tokenSlots: Partial<Record<ThemeToken, PaletteSlot>> = { syntaxString: 2, syntaxNumber: 5, searchMatchBg: 3 }

/** A target-lightness curve: a polynomial in the surface's OKLab lightness, fitted rather than derived. */
interface Curve {
  readonly coefficients: readonly number[]
  /** The range of surface lightness where the level can be reached; beyond it the level is relaxed. */
  readonly reachable: readonly [number, number]
}

const levels = {
  panel: {
    dark: { coefficients: [0.29131, -0.39746, 2.33185, -0.85524, -1.2076, 0.86276], reachable: [0, 0.979] },
    light: { coefficients: [-3.74073, 27.94549, -78.44258, 112.6798, -79.60015, 22.11277], reachable: [0.348, 1] },
  },
  track: {
    dark: { coefficients: [0.39028, -0.23015, 0.83573, 2.43829, -4.38292, 2.01582], reachable: [0, 0.946] },
    light: { coefficients: [-5.24921, 38.37322, -107.28833, 152.10005, -106.17127, 29.18061], reachable: [0.368, 1] },
  },
  thinking0: {
    dark: { coefficients: [0.52988, -0.05809, -0.30924, 4.63567, -6.52933, 2.89108], reachable: [0, 0.873] },
    light: { coefficients: [-28.27749, 182.85284, -469.62416, 603.15916, -384.59976, 97.35147], reachable: [0.51, 1] },
  },
  thinking1: {
    dark: { coefficients: [0.55278, -0.03667, -0.45659, 4.95347, -6.90265, 3.0706], reachable: [0, 0.858] },
    light: { coefficients: [-37.10484, 235.86282, -596.62344, 754.3633, -474.00763, 118.3551], reachable: [0.535, 1] },
  },
  thinking2: {
    dark: { coefficients: [0.57486, -0.01765, -0.58987, 5.25227, -7.27175, 3.25532], reachable: [0, 0.842] },
    light: { coefficients: [-59.89653, 377.05024, -945.07843, 1182.03145, -734.96375, 181.68658], reachable: [0.556, 1] },
  },
  thinking3: {
    dark: { coefficients: [0.59621, -0.00062, -0.71148, 5.53588, -7.6392, 3.44606], reachable: [0, 0.827] },
    light: { coefficients: [-72.07122, 445.84082, -1099.57352, 1353.88793, -829.53392, 202.26164], reachable: [0.58, 1] },
  },
  thinking4: {
    dark: { coefficients: [0.61691, 0.01462, -0.82288, 5.80651, -8.00641, 3.64333], reachable: [0, 0.811] },
    light: { coefficients: [-110.14338, 674.21488, -1645.75941, 2004.32367, -1215.15899, 293.3183], reachable: [0.6, 1] },
  },
  thinking5: {
    dark: { coefficients: [0.63702, 0.02826, -0.92498, 6.06465, -8.37246, 3.84651], reachable: [0, 0.795] },
    light: { coefficients: [-175.47701, 1063.54495, -2570.70594, 3098.80776, -1860.15527, 444.76392], reachable: [0.62, 1] },
  },
  thinking6: {
    dark: { coefficients: [0.65658, 0.04044, -1.01835, 6.30989, -8.73529, 4.05439], reachable: [0, 0.779] },
    light: { coefficients: [-183.81712, 1094.70055, -2602.68539, 3088.71276, -1826.91131, 430.75931], reachable: [0.643, 1] },
  },
  subtle: {
    dark: { coefficients: [0.56762, -0.02475, -0.5383, 5.12628, -7.10931, 3.17324], reachable: [0, 0.848] },
    light: { coefficients: [-232.85459, 1376.54473, -3249.11801, 3827.91186, -2248.29472, 526.55751], reachable: [0.657, 1] },
  },
  thumb: {
    dark: { coefficients: [0.60323, 0.00278, -0.73328, 5.57157, -7.68067, 3.46933], reachable: [0, 0.823] },
    light: { coefficients: [-82.89897, 511.01355, -1255.98095, 1540.76821, -940.68087, 228.58523], reachable: [0.586, 1] },
  },
  readable: {
    dark: { coefficients: [0.66937, 0.04704, -1.06871, 6.43941, -8.9332, 4.17229], reachable: [0, 0.77] },
    light: { coefficients: [-1554.52576, 8733.56817, -19604.93507, 21977.72696, -12300.99599, 2749.81288], reachable: [0.751, 1] },
  },
  emphasis: {
    dark: { coefficients: [0.7303, 0.07695, -1.31626, 7.1681, -10.14436, 4.92846], reachable: [0, 0.712] },
    light: { coefficients: [-4948.31942, 26870.91986, -58334.48399, 63280.17197, -34298.01053, 7430.30146], reachable: [0.811, 1] },
  },
  textOnPanel: {
    dark: { coefficients: [0.86713, 0.05232, -0.89428, 4.79014, -5.5432, 1.75023], reachable: [0, 0.542] },
    light: { coefficients: [-8570.89457, 43954.60805, -90084.00702, 92220.6791, -47152.15802, 9632.27113], reachable: [0.867, 1] },
  },
  text: {
    dark: { coefficients: [0.89242, 0.02311, -0.44862, 2.34417, -0.06084, -2.63844], reachable: [0, 0.5] },
    light: { coefficients: [-2004.67048, 6664.47299, -6060.70202, -1792.61209, 5133.82359, -1939.85583], reachable: [0.894, 1] },
  },
} as const satisfies Record<string, Record<TerminalColorScheme, Curve>>

type Level = keyof typeof levels

const panels = [
  'selectedBg',
  'searchMatchBg',
  'userMessageBg',
  'customMessageBg',
  'toolPendingBg',
  'toolSuccessBg',
  'toolErrorBg',
] as const satisfies readonly ThemeToken[]

type Panel = (typeof panels)[number]

type Surface = Panel | 'background' | 'scrollbarTrack'

interface Rule {
  readonly token: ThemeToken
  readonly on: readonly Surface[]
  readonly level: Level
}

const toolPanels = ['toolPendingBg', 'toolSuccessBg', 'toolErrorBg'] as const satisfies readonly Surface[]
const messagePanels = ['userMessageBg', 'customMessageBg'] as const satisfies readonly Surface[]

const thinkingTokens = [
  'thinkingOff',
  'thinkingMinimal',
  'thinkingLow',
  'thinkingMedium',
  'thinkingHigh',
  'thinkingXhigh',
  'thinkingMax',
] as const satisfies readonly ThemeToken[]

const thinkingLevels: Record<(typeof thinkingTokens)[number], Level> = {
  thinkingOff: 'thinking0',
  thinkingMinimal: 'thinking1',
  thinkingLow: 'thinking2',
  thinkingMedium: 'thinking3',
  thinkingHigh: 'thinking4',
  thinkingXhigh: 'thinking5',
  thinkingMax: 'thinking6',
}

const each = (tokens: readonly ThemeToken[], on: readonly Surface[], level: Level): Rule[] => tokens.map((token) => ({ token, on, level }))

const rules: readonly Rule[] = [
  ...each(panels, ['background'], 'panel'),
  { token: 'text', on: ['background'], level: 'text' },
  { token: 'text', on: ['selectedBg'], level: 'textOnPanel' },
  { token: 'userMessageText', on: ['userMessageBg'], level: 'textOnPanel' },
  { token: 'toolTitle', on: toolPanels, level: 'textOnPanel' },
  ...each(['accent', 'success', 'error', 'warning'], ['background', 'selectedBg', ...toolPanels], 'readable'),
  { token: 'muted', on: ['background', 'selectedBg', 'customMessageBg', ...toolPanels], level: 'readable' },
  { token: 'dim', on: ['background', 'selectedBg', 'customMessageBg', ...toolPanels], level: 'subtle' },
  { token: 'thinkingText', on: ['background'], level: 'readable' },
  { token: 'customMessageText', on: ['customMessageBg', ...toolPanels], level: 'readable' },
  { token: 'customMessageLabel', on: ['background', 'customMessageBg', 'selectedBg', ...toolPanels], level: 'readable' },
  { token: 'toolOutput', on: ['background', ...toolPanels], level: 'readable' },
  ...each(
    ['mdHeading', 'mdLink', 'mdLinkUrl', 'mdCode', 'mdQuote', 'mdCodeBlockBorder', 'mdListBullet'],
    ['background', ...messagePanels],
    'readable',
  ),
  { token: 'mdCodeBlock', on: ['background', ...messagePanels, ...toolPanels], level: 'readable' },
  ...each(['toolDiffAdded', 'toolDiffRemoved', 'toolDiffContext'], ['background', ...toolPanels], 'readable'),
  ...each(
    [
      'syntaxComment',
      'syntaxKeyword',
      'syntaxFunction',
      'syntaxVariable',
      'syntaxString',
      'syntaxNumber',
      'syntaxType',
      'syntaxOperator',
      'syntaxPunctuation',
    ],
    ['background', ...messagePanels, ...toolPanels],
    'readable',
  ),
  { token: 'searchMatchText', on: ['searchMatchBg'], level: 'readable' },
  ...each(['bashMode', 'border', 'borderAccent'], ['background'], 'readable'),
  { token: 'borderMuted', on: ['background'], level: 'subtle' },
  ...each(['mdQuoteBorder', 'mdHr'], ['background', ...messagePanels, ...toolPanels], 'readable'),
  { token: 'scrollbarTrack', on: ['background'], level: 'track' },
  { token: 'scrollbarThumb', on: ['scrollbarTrack'], level: 'thumb' },
  ...thinkingTokens.map((token): Rule => ({ token, on: ['background'], level: thinkingLevels[token] })),
]

/** Relaxation compresses levels stronger than this one toward it before weakening all levels. */
const readableFloor: Record<TerminalColorScheme, Level> = { dark: 'readable', light: 'subtle' }

/** Body text uses the terminal's foreground when it reaches this level, which is clearly stronger than muted. */
const foregroundLevel: Level = 'emphasis'

/** Text-level tokens that take the terminal's foreground. */
const bodyTextTokens = ['text', 'userMessageText', 'toolTitle'] as const satisfies readonly ThemeToken[]

/** WCAG 2 contrast ratio that body text must reach on the surfaces it is drawn on. */
const bodyTextContrastFloor = 4.5

/** Every surface before the tokens drawn on it. */
const solveOrder: readonly ThemeToken[] = (() => {
  const order: ThemeToken[] = []
  const visit = (token: ThemeToken): void => {
    if (order.includes(token)) return
    for (const rule of rules) {
      if (rule.token !== token) continue
      for (const surface of rule.on) if (surface !== 'background') visit(surface)
    }
    order.push(token)
  }
  for (const rule of rules) visit(rule.token)
  return order
})()

/** One colour the theme draws in: a hex colour, a palette index the terminal renders, or the terminal's own. */
export type DerivedColour =
  | { readonly kind: 'hex'; readonly hex: string }
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'terminal-default' }

/** The theme's colours for a terminal: one for each token, the tokens drawn faint when the terminal said nothing, and which of light and dark it is. */
export interface DerivedColours {
  readonly colours: Readonly<Record<ThemeToken, DerivedColour>>
  readonly faint: readonly ThemeToken[]
  readonly appearance: TerminalColorScheme | undefined
}

function oklabLightness(colour: RgbColor): number {
  return colorToOklch(rgbColor(colour.r, colour.g, colour.b)).l
}

/** WCAG 2's sRGB channel curve, linear in luminance. */
function linearChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b)
}

function wcagContrast(first: RgbColor, second: RgbColor): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Which of light and dark a terminal is: the direction of its own foreground when text can be readable that way, otherwise whichever of white and black text has more contrast on the background. */
function terminalAppearance(background: RgbColor, foreground?: RgbColor): TerminalColorScheme {
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }
  const whiteContrast = wcagContrast(white, background)
  const blackContrast = wcagContrast(black, background)
  if (foreground) {
    const foregroundL = oklabLightness(foreground)
    const backgroundL = oklabLightness(background)
    if (Math.abs(foregroundL - backgroundL) > 0.05) {
      const appearance = foregroundL > backgroundL ? 'dark' : 'light'
      const best = appearance === 'dark' ? whiteContrast : blackContrast
      if (best >= bodyTextContrastFloor) return appearance
    }
  }
  return whiteContrast >= blackContrast ? 'dark' : 'light'
}

function hexOf({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** A saturation weight at a lightness: a Gaussian centred at 0.5, 0 at black and white, 1 in between. */
const gaussianAt = (x: number): number => Math.exp(-((x - 0.5) ** 2) / (2 * 0.25 ** 2))

function bellWeight(lightness: number): number {
  return (gaussianAt(lightness) - gaussianAt(0)) / (1 - gaussianAt(0))
}

/** A family's saturation relative to its maximum: 1 at mid lightness, `min / max` at black and white. */
function saturationCurve({ saturation: { min, max } }: Family, lightness: number): number {
  const floor = max > 0 ? min / max : 1
  return floor + (1 - floor) * bellWeight(lightness)
}

function levelTarget(level: Level, appearance: TerminalColorScheme, surfaceL: number): number | undefined {
  const curve: Curve = levels[level][appearance]
  if (surfaceL < curve.reachable[0] || surfaceL > curve.reachable[1]) return undefined
  return curve.coefficients.reduce((sum, coefficient, power) => sum + coefficient * surfaceL ** power, 0)
}

/** The terminal's sixteen, as OKHSL channels by slot. */
type OkhslPalette = readonly [
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
  OkhslChannels,
]

const isSixteen = (channels: readonly OkhslChannels[]): channels is OkhslPalette => channels.length === 16

function okhslOf({ r, g, b }: RgbColor): OkhslChannels {
  return colorToOkhsl(rgbColor(r, g, b))
}

/** A source colour's hue at another lightness: its saturation applies at its own lightness and falls off along the family's curve, never rising above it. */
function anchored(source: OkhslChannels, family: Family, lightness: number): RgbColor {
  const anchor = saturationCurve(family, source.l)
  const falloff = anchor > 0 ? Math.min(1, saturationCurve(family, lightness) / anchor) : 1
  return okhslColor(source.h, source.s * falloff, lightness)
}

/** A text colour moved toward white or black until it reaches the WCAG floor on every surface. */
function withTextContrast(colour: RgbColor, surfaces: readonly RgbColor[], lighter: boolean): RgbColor {
  const meets = (candidate: RgbColor) => surfaces.every((surface) => wcagContrast(candidate, surface) >= bodyTextContrastFloor)
  if (meets(colour)) return colour
  const { h, s, l } = okhslOf(colour)
  const at = (lightness: number) => okhslColor(h, s, lightness)
  const extreme = lighter ? 1 : 0
  if (!meets(at(extreme))) return at(extreme)
  let [low, high] = [l, extreme]
  for (let index = 0; index < 20; index++) {
    const middle = (low + high) / 2
    if (meets(at(middle))) high = middle
    else low = middle
  }
  return at(high)
}

/**
 * The theme's default colours, derived from what the terminal reports: each colour's hue from one of the
 * terminal's sixteen, at a lightness that keeps its contrast on the reported background.
 */
export function deriveColours(report: TerminalColors, hint?: TerminalColorScheme): DerivedColours {
  const { background, foreground } = report
  if (!background) return indexedColours(hint)
  const mapped = report.palette?.map(okhslOf)
  const palette = mapped !== undefined && isSixteen(mapped) ? mapped : undefined

  const appearance = terminalAppearance(background, foreground)
  const lighter = appearance === 'dark'
  const extreme = lighter ? 1 : 0
  const backgroundL = oklabLightness(background)

  const paint = (token: ThemeToken, oklabL: number): RgbColor => {
    const lightness = oklabToOkhslLightness(oklabL)
    const family: Family = families[tokenFamilies[token]]
    if (!palette) {
      const { min, max } = family.saturation
      return okhslColor(family.hue, min + (max - min) * bellWeight(lightness), lightness)
    }
    return anchored(palette[tokenSlots[token] ?? family.slot], family, lightness)
  }

  const target = (level: Level, surfaceL: number, t: number): number | undefined => {
    const reached = levelTarget(level, appearance, surfaceL)
    if (reached === undefined && t === 0) return undefined
    const distance = (reached ?? extreme) - surfaceL
    const floor = (levelTarget(readableFloor[appearance], appearance, surfaceL) ?? extreme) - surfaceL
    const compressed = Math.abs(distance) > Math.abs(floor) ? distance - (distance - floor) * Math.min(t, 1) : distance
    return surfaceL + compressed * (1 - Math.max(0, t - 1))
  }

  // Panels near mid-gray stay far enough toward white or black that body text still reaches its floor on them.
  const extremeText = lighter ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }
  const readable = (colour: RgbColor) => wcagContrast(extremeText, colour) >= bodyTextContrastFloor
  const limitPanel = (token: ThemeToken, l: number): RgbColor => {
    const colour = paint(token, l)
    if (readable(colour)) return colour
    let [low, high] = [backgroundL, l]
    for (let index = 0; index < 20; index++) {
      const middle = (low + high) / 2
      if (readable(paint(token, middle))) low = middle
      else high = middle
    }
    return paint(token, low)
  }

  const solve = (t: number): Map<Surface | ThemeToken, RgbColor> | undefined => {
    const solved = new Map<Surface | ThemeToken, RgbColor>([['background', background]])
    for (const token of solveOrder) {
      const targets: number[] = []
      for (const rule of rules) {
        if (rule.token !== token) continue
        for (const surface of rule.on) {
          const value = target(rule.level, oklabLightness(solved.get(surface) ?? background), t)
          if (value === undefined || value < 0 || value > 1) return undefined
          targets.push(value)
        }
      }
      const l = lighter ? Math.max(...targets) : Math.min(...targets)
      solved.set(token, (panels as readonly string[]).includes(token) ? limitPanel(token, l) : paint(token, l))
    }
    return solved
  }

  let relaxation = 0
  let solution = solve(0)
  if (!solution) {
    // A background near mid-gray cannot fit every level, so the levels are relaxed as little as they still fit.
    let [low, high] = [0, 2]
    solution = solve(high)
    for (let index = 0; index < 20; index++) {
      const middle = (low + high) / 2
      const attempt = solve(middle)
      if (attempt) [high, solution] = [middle, attempt]
      else low = middle
    }
    relaxation = high
  }
  const solved = solution ?? new Map<Surface | ThemeToken, RgbColor>()
  const surfacesOf = (token: ThemeToken): RgbColor[] =>
    rules.filter((rule) => rule.token === token).flatMap((rule) => rule.on.map((surface) => solved.get(surface) ?? background))

  const colours = {} as Record<ThemeToken, DerivedColour>
  for (const token of Object.keys(tokenFamilies) as ThemeToken[]) {
    const colour = solved.get(token)
    colours[token] = colour === undefined ? { kind: 'terminal-default' } : { kind: 'hex', hex: hexOf(colour) }
  }

  for (const token of bodyTextTokens) {
    const surfaces = surfacesOf(token)
    let text = solved.get(token)
    if (foreground) {
      const targets = surfaces.map((surface) => target(foregroundLevel, oklabLightness(surface), relaxation))
      if (targets.every((value) => value !== undefined && value >= 0 && value <= 1)) {
        const needed = lighter ? Math.max(...(targets as number[])) : Math.min(...(targets as number[]))
        const foregroundL = oklabLightness(foreground)
        if (lighter ? foregroundL >= needed : foregroundL <= needed) {
          colours[token] = { kind: 'terminal-default' }
          continue
        }
        text = anchored(okhslOf(foreground), families.neutral, oklabToOkhslLightness(needed))
      }
    }
    if (text) colours[token] = { kind: 'hex', hex: hexOf(withTextContrast(text, surfaces, lighter)) }
  }
  return { colours, faint: [], appearance }
}

/** Colours for a terminal that reported nothing: the terminal renders the indices with its own theme, so they fit any background, and panels have no fill of their own. */
function indexedColours(hint: TerminalColorScheme | undefined): DerivedColours {
  const colours = {} as Record<ThemeToken, DerivedColour>
  const faint: ThemeToken[] = []
  for (const [token, familyName] of Object.entries(tokenFamilies) as [ThemeToken, FamilyName][]) {
    if ((panels as readonly string[]).includes(token)) {
      colours[token] = { kind: 'terminal-default' }
      continue
    }
    const neutral = familyName === 'neutral'
    colours[token] = !neutral ? { kind: 'index', index: tokenSlots[token] ?? families[familyName].slot } : { kind: 'terminal-default' }
    if (neutral && !(bodyTextTokens as readonly string[]).includes(token)) faint.push(token)
  }
  return { colours, faint, appearance: hint }
}
