import type { Screen } from '../api.ts'

export const TALK: Screen = {
  name: 'talk',
  layout: {
    column: [
      { place: 'transcript', size: 'fill' },
      { place: 'status', size: 'content' },
      { place: 'composer', size: 'content' },
    ],
  },
}
