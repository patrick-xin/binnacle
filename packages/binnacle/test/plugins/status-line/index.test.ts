import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { RegistrationService } from '../../../src/host/registrations.ts'
import { ScreenPane } from '../../../src/panes/screen.ts'
import * as statusLine from '../../../src/plugins/status-line/index.ts'
import { drawText } from '../../support/draw.ts'

/**
 * The line the Status line draws while dsh's token meter holds these projections, for an agent that has asked nothing yet.
 * @param values - the projections, by key.
 * @returns what the line says, drawn at 60 columns.
 */
async function lineWith(values: Record<string, unknown>): Promise<string> {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  ctx.provide('sessionProjections', { snapshot: () => ({ values }), onChanged: () => () => {} } as never)
  await ctx.plugin(statusLine)
  registrations.open({ send: () => {}, command: async () => true, agent: { options: { provider: 'deepseek', model: 'v4' }, session: { requestHeader: () => undefined } } as unknown as Agent })
  const placed = registrations.placed('below-composer').at(-1)
  assert.ok(placed?.kind === 'lines')
  const pane = new ScreenPane(() => [])
  pane.place('below-composer', { draw: drawn => placed.draw(drawn, {}) })
  return drawText(pane, 60).join('\n')
}

/**
 * The tokens the line says for a count, sent all at once.
 * @param count - the tokens.
 * @returns the line.
 */
const tokens = (count: number): Promise<string> => lineWith({ tokenUsage: { uncachedInputTokens: count, outputTokens: 0, cacheReadTokens: 0 } })

test('a count that rounds to a thousand of its unit is written in the next unit: 999,999 tokens is 1m, never 1000k', async () => {
  assert.equal(await tokens(999), 'deepseek/v4 · 999 tokens')
  assert.equal(await tokens(1_000), 'deepseek/v4 · 1k tokens')
  assert.equal(await tokens(999_499), 'deepseek/v4 · 999k tokens')
  assert.equal(await tokens(999_500), 'deepseek/v4 · 1m tokens')
  assert.equal(await tokens(999_999), 'deepseek/v4 · 1m tokens')
  assert.equal(await tokens(1_240_000), 'deepseek/v4 · 1.2m tokens')
})

test('a context the next request would overfill reads as full, never past it', async () => {
  assert.equal(await lineWith({ contextPressure: { projectedTokens: 40_000, contextWindow: 32_768 } }), 'deepseek/v4 · 100% of context')
})
