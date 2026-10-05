export interface Edge {
  readonly topLeft: string
  readonly top: string
  readonly topRight: string
  readonly right: string
  readonly bottomRight: string
  readonly bottom: string
  readonly bottomLeft: string
  readonly left: string
}

const edge = (corners: string, top: string, side: string, bottom = top): Edge => {
  const [topLeft = '', topRight = '', bottomRight = '', bottomLeft = ''] = corners
  return { topLeft, top, topRight, right: side, bottomRight, bottom, bottomLeft, left: side }
}

const ROUNDED = edge('╭╮╯╰', '─', '│')

export const edges: { readonly [name: string]: Edge } = {
  rounded: ROUNDED,
  square: edge('┌┐┘└', '─', '│'),
  heavy: edge('┏┓┛┗', '━', '┃'),
  double: edge('╔╗╝╚', '═', '║'),
  block: { ...edge('▛▜▟▙', '▀', '▌', '▄'), right: '▐' },
  none: edge('    ', ' ', ' '),
}

export const theme = {
  padding: 0,
  gap: 0,
  edge: 'rounded',
}

export function edgeNamed(name: string | undefined): Edge {
  return edges[name ?? theme.edge] ?? edges[theme.edge] ?? ROUNDED
}
