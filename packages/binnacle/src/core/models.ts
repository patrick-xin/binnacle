import type { Context } from '@deepseek-ai/cordis'
import type { Model } from '../api.ts'
import { startClock } from './clock.ts'
import { startTurn } from './turn.ts'

/** The core's own models, by name, which an author reads and does not set. */
export function coreModels(ctx: Context): readonly (readonly [string, Model<object>])[] {
  return [
    ['clock', startClock(ctx)],
    ['turn', startTurn(ctx)],
  ]
}
