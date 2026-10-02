import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveColours } from '../../src/ui/derived-colours.ts'
import type { DerivedColour } from '../../src/ui/derived-colours.ts'

const rgb = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) })

/** Catppuccin's Mocha and Latte, as their terminal mappings set the sixteen. */
const mocha = [
  '#45475A',
  '#F38BA8',
  '#A6E3A1',
  '#F9E2AF',
  '#89B4FA',
  '#F5C2E7',
  '#94E2D5',
  '#BAC2DE',
  '#585B70',
  '#F38BA8',
  '#A6E3A1',
  '#F9E2AF',
  '#89B4FA',
  '#F5C2E7',
  '#94E2D5',
  '#A6ADC8',
].map(rgb)
const latte = [
  '#5C5F77',
  '#D20F39',
  '#40A02B',
  '#DF8E1D',
  '#1E66F5',
  '#EA76CB',
  '#179299',
  '#ACB0BE',
  '#6C6F85',
  '#D20F39',
  '#40A02B',
  '#DF8E1D',
  '#1E66F5',
  '#EA76CB',
  '#179299',
  '#BCC0CC',
].map(rgb)

test('a dark palette the terminal reports gives every token a colour of its own, in hex, and says the terminal is dark', () => {
  const derived = deriveColours({ background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4'), palette: mocha })
  assert.equal(derived.appearance, 'dark')
  assert.deepEqual(derived.faint, [])
  assert.deepEqual(derived.colours, {
    selectedBg: { kind: 'hex', hex: '#15305d' },
    searchMatchBg: { kind: 'hex', hex: '#3e300b' },
    userMessageBg: { kind: 'hex', hex: '#15305d' },
    customMessageBg: { kind: 'hex', hex: '#57084a' },
    toolPendingBg: { kind: 'hex', hex: '#30313a' },
    toolSuccessBg: { kind: 'hex', hex: '#20391e' },
    toolErrorBg: { kind: 'hex', hex: '#511f2e' },
    text: { kind: 'terminal-default' },
    userMessageText: { kind: 'terminal-default' },
    customMessageText: { kind: 'hex', hex: '#9c9fb3' },
    toolTitle: { kind: 'terminal-default' },
    syntaxOperator: { kind: 'hex', hex: '#9c9fb3' },
    syntaxPunctuation: { kind: 'hex', hex: '#9c9fb3' },
    muted: { kind: 'hex', hex: '#9c9fb3' },
    dim: { kind: 'hex', hex: '#7d8199' },
    thinkingText: { kind: 'hex', hex: '#9497ae' },
    toolOutput: { kind: 'hex', hex: '#9c9fb3' },
    mdLinkUrl: { kind: 'hex', hex: '#9b9fb3' },
    mdQuote: { kind: 'hex', hex: '#9b9fb3' },
    mdQuoteBorder: { kind: 'hex', hex: '#9c9fb3' },
    mdHr: { kind: 'hex', hex: '#9c9fb3' },
    mdCodeBlockBorder: { kind: 'hex', hex: '#9b9fb3' },
    toolDiffContext: { kind: 'hex', hex: '#9c9fb3' },
    syntaxComment: { kind: 'hex', hex: '#9c9fb3' },
    scrollbarTrack: { kind: 'hex', hex: '#464857' },
    scrollbarThumb: { kind: 'hex', hex: '#9598ae' },
    searchMatchText: { kind: 'hex', hex: '#9b9fb3' },
    borderMuted: { kind: 'hex', hex: '#757991' },
    accent: { kind: 'hex', hex: '#e868cd' },
    borderAccent: { kind: 'hex', hex: '#e45ac9' },
    customMessageLabel: { kind: 'hex', hex: '#e868cd' },
    mdCode: { kind: 'hex', hex: '#e868cd' },
    mdListBullet: { kind: 'hex', hex: '#e868cd' },
    syntaxType: { kind: 'hex', hex: '#e868cd' },
    border: { kind: 'hex', hex: '#5f98f5' },
    mdLink: { kind: 'hex', hex: '#6a9ff7' },
    syntaxKeyword: { kind: 'hex', hex: '#6aa0f7' },
    syntaxVariable: { kind: 'hex', hex: '#5db2a5' },
    success: { kind: 'hex', hex: '#73b36f' },
    mdCodeBlock: { kind: 'hex', hex: '#73b36f' },
    toolDiffAdded: { kind: 'hex', hex: '#73b36f' },
    bashMode: { kind: 'hex', hex: '#6dab69' },
    syntaxNumber: { kind: 'hex', hex: '#e868cd' },
    error: { kind: 'hex', hex: '#ed7197' },
    toolDiffRemoved: { kind: 'hex', hex: '#ed7197' },
    warning: { kind: 'hex', hex: '#c19a3b' },
    mdHeading: { kind: 'hex', hex: '#c19a3b' },
    syntaxFunction: { kind: 'hex', hex: '#c19a3b' },
    syntaxString: { kind: 'hex', hex: '#73b36f' },
    thinkingOff: { kind: 'hex', hex: '#6b6e85' },
    thinkingMinimal: { kind: 'hex', hex: '#2f71dd' },
    thinkingLow: { kind: 'hex', hex: '#3678e4' },
    thinkingMedium: { kind: 'hex', hex: '#489287' },
    thinkingHigh: { kind: 'hex', hex: '#d642ba' },
    thinkingXhigh: { kind: 'hex', hex: '#dc4bc0' },
    thinkingMax: { kind: 'hex', hex: '#e75f8b' },
  })
})

test('a light palette the terminal reports gives every token a colour of its own, and says the terminal is light', () => {
  const derived = deriveColours({ background: rgb('#EFF1F5'), foreground: rgb('#4C4F69'), palette: latte })
  assert.equal(derived.appearance, 'light')
  assert.deepEqual(derived.faint, [])
  assert.deepEqual(derived.colours, {
    selectedBg: { kind: 'hex', hex: '#d9e0ed' },
    searchMatchBg: { kind: 'hex', hex: '#ecddce' },
    userMessageBg: { kind: 'hex', hex: '#d9e0ed' },
    customMessageBg: { kind: 'hex', hex: '#eed9e7' },
    toolPendingBg: { kind: 'hex', hex: '#dfdfe3' },
    toolSuccessBg: { kind: 'hex', hex: '#d7e5d4' },
    toolErrorBg: { kind: 'hex', hex: '#ecdcdb' },
    text: { kind: 'hex', hex: '#494c65' },
    userMessageText: { kind: 'hex', hex: '#494c65' },
    customMessageText: { kind: 'hex', hex: '#62657a' },
    toolTitle: { kind: 'hex', hex: '#494c65' },
    syntaxOperator: { kind: 'hex', hex: '#62657a' },
    syntaxPunctuation: { kind: 'hex', hex: '#62657a' },
    muted: { kind: 'hex', hex: '#62657a' },
    dim: { kind: 'hex', hex: '#83869c' },
    thinkingText: { kind: 'hex', hex: '#787b92' },
    toolOutput: { kind: 'hex', hex: '#62657a' },
    mdLinkUrl: { kind: 'hex', hex: '#63657a' },
    mdQuote: { kind: 'hex', hex: '#63657a' },
    mdQuoteBorder: { kind: 'hex', hex: '#62657a' },
    mdHr: { kind: 'hex', hex: '#62657a' },
    mdCodeBlockBorder: { kind: 'hex', hex: '#63657a' },
    toolDiffContext: { kind: 'hex', hex: '#62657a' },
    syntaxComment: { kind: 'hex', hex: '#62657a' },
    scrollbarTrack: { kind: 'hex', hex: '#dbdce0' },
    scrollbarThumb: { kind: 'hex', hex: '#9497aa' },
    searchMatchText: { kind: 'hex', hex: '#63657a' },
    borderMuted: { kind: 'hex', hex: '#979aad' },
    accent: { kind: 'hex', hex: '#a9238c' },
    borderAccent: { kind: 'hex', hex: '#c736a7' },
    customMessageLabel: { kind: 'hex', hex: '#a9238c' },
    mdCode: { kind: 'hex', hex: '#a9238d' },
    mdListBullet: { kind: 'hex', hex: '#a9238d' },
    syntaxType: { kind: 'hex', hex: '#a9238c' },
    border: { kind: 'hex', hex: '#2f72f8' },
    mdLink: { kind: 'hex', hex: '#1b5bd9' },
    syntaxKeyword: { kind: 'hex', hex: '#1b5bd9' },
    syntaxVariable: { kind: 'hex', hex: '#14757a' },
    success: { kind: 'hex', hex: '#307a20' },
    mdCodeBlock: { kind: 'hex', hex: '#307a20' },
    toolDiffAdded: { kind: 'hex', hex: '#307a20' },
    bashMode: { kind: 'hex', hex: '#3b9328' },
    syntaxNumber: { kind: 'hex', hex: '#a9238c' },
    error: { kind: 'hex', hex: '#bd1735' },
    toolDiffRemoved: { kind: 'hex', hex: '#bd1735' },
    warning: { kind: 'hex', hex: '#8f590a' },
    mdHeading: { kind: 'hex', hex: '#8f590a' },
    syntaxFunction: { kind: 'hex', hex: '#8f590a' },
    syntaxString: { kind: 'hex', hex: '#307a20' },
    thinkingOff: { kind: 'hex', hex: '#bec0ca' },
    thinkingMinimal: { kind: 'hex', hex: '#9fbcf0' },
    thinkingLow: { kind: 'hex', hex: '#95b6f2' },
    thinkingMedium: { kind: 'hex', hex: '#4ac4cc' },
    thinkingHigh: { kind: 'hex', hex: '#ea7fcc' },
    thinkingXhigh: { kind: 'hex', hex: '#e973ca' },
    thinkingMax: { kind: 'hex', hex: '#fd656e' },
  })
})

test("a terminal that reports nothing gets the terminal's own colours, its neutral tokens drawn faint", () => {
  const derived = deriveColours({}, 'dark')
  assert.equal(derived.appearance, 'dark')
  assert.deepEqual(derived.faint, [
    'customMessageText',
    'syntaxOperator',
    'syntaxPunctuation',
    'muted',
    'dim',
    'thinkingText',
    'toolOutput',
    'mdLinkUrl',
    'mdQuote',
    'mdQuoteBorder',
    'mdHr',
    'mdCodeBlockBorder',
    'toolDiffContext',
    'syntaxComment',
    'scrollbarTrack',
    'scrollbarThumb',
    'searchMatchText',
    'borderMuted',
    'thinkingOff',
  ])
  assert.deepEqual(derived.colours, {
    selectedBg: { kind: 'terminal-default' },
    searchMatchBg: { kind: 'terminal-default' },
    userMessageBg: { kind: 'terminal-default' },
    customMessageBg: { kind: 'terminal-default' },
    toolPendingBg: { kind: 'terminal-default' },
    toolSuccessBg: { kind: 'terminal-default' },
    toolErrorBg: { kind: 'terminal-default' },
    text: { kind: 'terminal-default' },
    userMessageText: { kind: 'terminal-default' },
    customMessageText: { kind: 'terminal-default' },
    toolTitle: { kind: 'terminal-default' },
    syntaxOperator: { kind: 'terminal-default' },
    syntaxPunctuation: { kind: 'terminal-default' },
    muted: { kind: 'terminal-default' },
    dim: { kind: 'terminal-default' },
    thinkingText: { kind: 'terminal-default' },
    toolOutput: { kind: 'terminal-default' },
    mdLinkUrl: { kind: 'terminal-default' },
    mdQuote: { kind: 'terminal-default' },
    mdQuoteBorder: { kind: 'terminal-default' },
    mdHr: { kind: 'terminal-default' },
    mdCodeBlockBorder: { kind: 'terminal-default' },
    toolDiffContext: { kind: 'terminal-default' },
    syntaxComment: { kind: 'terminal-default' },
    scrollbarTrack: { kind: 'terminal-default' },
    scrollbarThumb: { kind: 'terminal-default' },
    searchMatchText: { kind: 'terminal-default' },
    borderMuted: { kind: 'terminal-default' },
    accent: { kind: 'index', index: 5 },
    borderAccent: { kind: 'index', index: 5 },
    customMessageLabel: { kind: 'index', index: 5 },
    mdCode: { kind: 'index', index: 5 },
    mdListBullet: { kind: 'index', index: 5 },
    syntaxType: { kind: 'index', index: 5 },
    border: { kind: 'index', index: 4 },
    mdLink: { kind: 'index', index: 4 },
    syntaxKeyword: { kind: 'index', index: 4 },
    syntaxVariable: { kind: 'index', index: 6 },
    success: { kind: 'index', index: 2 },
    mdCodeBlock: { kind: 'index', index: 2 },
    toolDiffAdded: { kind: 'index', index: 2 },
    bashMode: { kind: 'index', index: 2 },
    syntaxNumber: { kind: 'index', index: 5 },
    error: { kind: 'index', index: 1 },
    toolDiffRemoved: { kind: 'index', index: 1 },
    warning: { kind: 'index', index: 3 },
    mdHeading: { kind: 'index', index: 3 },
    syntaxFunction: { kind: 'index', index: 3 },
    syntaxString: { kind: 'index', index: 2 },
    thinkingOff: { kind: 'terminal-default' },
    thinkingMinimal: { kind: 'index', index: 4 },
    thinkingLow: { kind: 'index', index: 4 },
    thinkingMedium: { kind: 'index', index: 6 },
    thinkingHigh: { kind: 'index', index: 5 },
    thinkingXhigh: { kind: 'index', index: 13 },
    thinkingMax: { kind: 'index', index: 1 },
  })
  assert.equal(deriveColours({}).appearance, undefined)
})

test("a terminal that reports no palette gets each family's own hue, and a short palette is read as none", () => {
  const derived = deriveColours({ background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4') })
  assert.equal(derived.appearance, 'dark')
  assert.deepEqual(derived.faint, [])
  assert.deepEqual(derived.colours, {
    selectedBg: { kind: 'hex', hex: '#203540' },
    searchMatchBg: { kind: 'hex', hex: '#452b1b' },
    userMessageBg: { kind: 'hex', hex: '#203540' },
    customMessageBg: { kind: 'hex', hex: '#342c4a' },
    toolPendingBg: { kind: 'hex', hex: '#2f3234' },
    toolSuccessBg: { kind: 'hex', hex: '#21382b' },
    toolErrorBg: { kind: 'hex', hex: '#4c2525' },
    text: { kind: 'terminal-default' },
    userMessageText: { kind: 'terminal-default' },
    customMessageText: { kind: 'hex', hex: '#99a2a6' },
    toolTitle: { kind: 'terminal-default' },
    syntaxOperator: { kind: 'hex', hex: '#99a2a6' },
    syntaxPunctuation: { kind: 'hex', hex: '#99a2a6' },
    muted: { kind: 'hex', hex: '#99a2a6' },
    dim: { kind: 'hex', hex: '#7a848a' },
    thinkingText: { kind: 'hex', hex: '#919ba0' },
    toolOutput: { kind: 'hex', hex: '#99a2a6' },
    mdLinkUrl: { kind: 'hex', hex: '#99a1a6' },
    mdQuote: { kind: 'hex', hex: '#99a1a6' },
    mdQuoteBorder: { kind: 'hex', hex: '#99a2a6' },
    mdHr: { kind: 'hex', hex: '#99a2a6' },
    mdCodeBlockBorder: { kind: 'hex', hex: '#99a1a6' },
    toolDiffContext: { kind: 'hex', hex: '#99a2a6' },
    syntaxComment: { kind: 'hex', hex: '#99a2a6' },
    scrollbarTrack: { kind: 'hex', hex: '#444a4d' },
    scrollbarThumb: { kind: 'hex', hex: '#929ba0' },
    searchMatchText: { kind: 'hex', hex: '#99a1a6' },
    borderMuted: { kind: 'hex', hex: '#727c82' },
    accent: { kind: 'hex', hex: '#a494d6' },
    borderAccent: { kind: 'hex', hex: '#9e8bd4' },
    customMessageLabel: { kind: 'hex', hex: '#a494d6' },
    mdCode: { kind: 'hex', hex: '#a494d6' },
    mdListBullet: { kind: 'hex', hex: '#a494d6' },
    syntaxType: { kind: 'hex', hex: '#a494d6' },
    border: { kind: 'hex', hex: '#58a3c8' },
    mdLink: { kind: 'hex', hex: '#63aacd' },
    syntaxKeyword: { kind: 'hex', hex: '#63aacd' },
    syntaxVariable: { kind: 'hex', hex: '#56b0b7' },
    success: { kind: 'hex', hex: '#62b488' },
    mdCodeBlock: { kind: 'hex', hex: '#62b488' },
    toolDiffAdded: { kind: 'hex', hex: '#62b488' },
    bashMode: { kind: 'hex', hex: '#57ad80' },
    syntaxNumber: { kind: 'hex', hex: '#62b488' },
    error: { kind: 'hex', hex: '#eb787b' },
    toolDiffRemoved: { kind: 'hex', hex: '#eb787b' },
    warning: { kind: 'hex', hex: '#ca961d' },
    mdHeading: { kind: 'hex', hex: '#ca961d' },
    syntaxFunction: { kind: 'hex', hex: '#ca961d' },
    syntaxString: { kind: 'hex', hex: '#dd8852' },
    thinkingOff: { kind: 'hex', hex: '#687177' },
    thinkingMinimal: { kind: 'hex', hex: '#637a87' },
    thinkingLow: { kind: 'hex', hex: '#50849f' },
    thinkingMedium: { kind: 'hex', hex: '#5d81c9' },
    thinkingHigh: { kind: 'hex', hex: '#9270e3' },
    thinkingXhigh: { kind: 'hex', hex: '#dc4bbd' },
    thinkingMax: { kind: 'hex', hex: '#fe485b' },
  })
  assert.deepEqual(
    deriveColours({ background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4'), palette: mocha.slice(0, 15) }).colours,
    derived.colours,
  )
})

/** WCAG 2's relative luminance, and the contrast ratio of two colours it gives. */
const linearChannel = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }): number =>
  0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b)

const contrast = (first: { r: number; g: number; b: number }, second: { r: number; g: number; b: number }): number =>
  (Math.max(relativeLuminance(first), relativeLuminance(second)) + 0.05) /
  (Math.min(relativeLuminance(first), relativeLuminance(second)) + 0.05)

const hexOf = (colour: DerivedColour): string => {
  if (colour.kind !== 'hex') throw new Error(`a panel of a terminal that reported its background is ${colour.kind}, not a colour`)
  return colour.hex
}

test('body text keeps its 4.5:1 WCAG 2 floor on every surface it is drawn on, mid-gray included', () => {
  for (const { name, report, background, foreground } of [
    {
      name: 'a dark palette',
      report: { background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4'), palette: mocha },
      background: '#1E1E2E',
      foreground: '#CDD6F4',
    },
    {
      name: 'a light palette',
      report: { background: rgb('#EFF1F5'), foreground: rgb('#4C4F69'), palette: latte },
      background: '#EFF1F5',
      foreground: '#4C4F69',
    },
    {
      name: 'a background with no palette',
      report: { background: rgb('#1E1E2E'), foreground: rgb('#CDD6F4') },
      background: '#1E1E2E',
      foreground: '#CDD6F4',
    },
    {
      name: 'a mid-gray background',
      report: { background: rgb('#606060'), foreground: rgb('#777777') },
      background: '#606060',
      foreground: '#777777',
    },
  ]) {
    const derived = deriveColours(report)
    const drawnOn: Record<'text' | 'userMessageText' | 'toolTitle', string[]> = {
      text: [background, hexOf(derived.colours.selectedBg)],
      userMessageText: [hexOf(derived.colours.userMessageBg)],
      toolTitle: [hexOf(derived.colours.toolPendingBg), hexOf(derived.colours.toolSuccessBg), hexOf(derived.colours.toolErrorBg)],
    }
    for (const [token, surfaces] of Object.entries(drawnOn) as ['text' | 'userMessageText' | 'toolTitle', string[]][]) {
      const colour = derived.colours[token]
      const drawn = colour.kind === 'hex' ? colour.hex : foreground
      for (const surface of surfaces)
        assert.ok(
          contrast(rgb(drawn), rgb(surface)) >= 4.5,
          `${name}: ${token} drawn in ${drawn} on ${surface} is ${contrast(rgb(drawn), rgb(surface)).toFixed(2)}:1, under the floor`,
        )
    }
  }
})
