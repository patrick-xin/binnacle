import type { Screen } from '../api.ts'

export const CHAT: Screen = {
  name: 'chat',
  layout: {
    column: [
      { place: 'transcript', size: 'fill' },
      { place: 'status', size: 'content' },
      { place: 'composer', size: 'content' },
    ],
  },
}
