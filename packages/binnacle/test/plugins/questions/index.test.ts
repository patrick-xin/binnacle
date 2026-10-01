/**
 * Questions: what the ask leaves standing at the plugin's own seam.
 *
 * The plugin is applied over the real registration service in a Cordis
 * context, as an author's would be; the waterfall is asked as dsh's service
 * asks it, and the card's offers are invoked as the surface invokes them,
 * through the placement it seated. What is held here is the protocol of
 * finishing: an ask leaves what stands when it finishes, so disposing the
 * plugin hands over what stands and nothing else.
 * @module binnacle/test/plugins/questions
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { RegistrationService } from '../../../src/host/registrations.ts'
import { questions } from '../../../src/plugins/questions/index.ts'
import type { Placement } from '../../../src/api.ts'

/**
 * The ask's question as the tests ask it: one option, so one invoked offer answers.
 * @returns the request's questions.
 */
const oneQuestion = (): [{ id: string; question: string; options: { label: string }[] }] => [
  { id: 'q1', question: 'which database?', options: [{ label: 'postgres' }] },
]

/**
 * Ask as dsh's user-questions service does: down the `user-questions/request` waterfall, counting each fall to the next answerer, failing `NO_PROVIDER`.
 * @param ctx - the context the answerers are on.
 * @param fellThrough - receives how many times nothing answered.
 * @returns the answer an answerer settled, or the rejection it was refused with.
 */
const ask = (ctx: Context, fellThrough: { count: number }): Promise<AskUserQuestionAnswer> =>
  ctx.waterfall('user-questions/request', { questions: oneQuestion() }, () => {
    fellThrough.count += 1
    return Promise.reject(new UserQuestionError('no user-questions answerer accepted the request', 'NO_PROVIDER'))
  })

/** The card the ask seated, as the surface reads it back. */
const seatedCard = (registrations: RegistrationService): Extract<Placement, { readonly kind: 'lines' }> | undefined =>
  registrations.placed('composer').at(-1)?.kind === 'lines'
    ? (registrations.placed('composer').at(-1) as Extract<Placement, { readonly kind: 'lines' }>)
    : undefined

test('an ask still standing when the plugin is disposed goes to the next answerer, and its card is gone', async () => {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  const fiber = await ctx.plugin(questions)
  const fellThrough = { count: 0 }
  const answer = ask(ctx, fellThrough)
  const refusal = answer.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  const card = seatedCard(registrations)
  assert.ok(card !== undefined, 'the ask seated its card')
  await fiber.dispose()
  assert.equal(fellThrough.count, 1, 'the ask went to the next answerer once')
  const reason = await refusal
  assert.equal(
    reason instanceof Error && reason.name === 'UserQuestionError' && (reason as { code?: string }).code === 'NO_PROVIDER',
    true,
    'none answered',
  )
  assert.equal(seatedCard(registrations), undefined, 'the card is gone')
})

test('an ask that finishes leaves what stands: disposing the plugin afterwards hands nothing over', async () => {
  const ctx = new Context()
  const registrations = new RegistrationService(ctx)
  const fiber = await ctx.plugin(questions)
  const fellThrough = { count: 0 }
  const answer = ask(ctx, fellThrough)
  const card = seatedCard(registrations)
  assert.ok(card !== undefined, 'the ask seated its card')
  card.invoke?.('option 1', 'choose')
  assert.deepEqual(await answer, { answers: [{ id: 'q1', selected: ['postgres'] }] })
  assert.equal(seatedCard(registrations), undefined, 'answering took the card back')
  await fiber.dispose()
  assert.equal(fellThrough.count, 0, 'a finished ask is not handed to the next answerer')
})
