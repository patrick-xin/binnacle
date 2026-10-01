import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { blockOf } from './adapt.ts'
import type { Block } from './adapt.ts'

/** An answer as it streams, before the session logs it: gone once the log holds the answer of its turn and step. */
export interface Streamed {
  /** The turn it answers. */
  readonly turn: number
  /** The step of that turn it is written in. */
  readonly step: number
  /** What has arrived, text and reasoning, as dsh keeps a stream cut short; no tool call. */
  readonly blocks: readonly Block[]
}

/** The attempt streaming now, read from dsh's frames. */
export class AnswerStream {
  #open: { readonly attemptId: string; readonly turn: number; readonly step: number; readonly assembler: BlockAssembler } | undefined
  #answer: Streamed | undefined

  read(frame: AssistantStreamFrame): void {
    if (frame.type === 'start')
      this.#open = { attemptId: frame.attemptId, turn: frame.turn, step: frame.step, assembler: new BlockAssembler() }
    else if (frame.attemptId !== this.#open?.attemptId) return
    else if (frame.type === 'chunk') this.#open.assembler.push(frame.chunk)
    else this.#open = undefined
    this.#answer = undefined
  }

  get answer(): Streamed | undefined {
    const open = this.#open
    if (open === undefined) return undefined
    this.#answer ??= Object.freeze({
      turn: open.turn,
      step: open.step,
      blocks: Object.freeze(open.assembler.interruptedBlocks().map(blockOf)),
    })
    return this.#answer
  }
}
