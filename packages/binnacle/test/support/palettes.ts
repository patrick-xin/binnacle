/** Worked palettes a terminal reports, as their own terminal mappings set them, and the colour a `#rrggbb` names. */
export const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
})

/** Catppuccin's Mocha and Latte, as their terminal mappings set the sixteen. */
export const mocha = [
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
export const latte = [
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
