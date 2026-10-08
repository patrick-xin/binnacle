import type { ChatSession, Handle, Part } from '../../api.ts'

/** One Request that stands in the queue. */
export interface Standing {
  /** The Request's view, which takes the composer's Place while the Request is shown. */
  part: Part
  /** Places the view, through the plugin that owns the Request: the core takes the placement down when that plugin unloads. */
  readonly place: (part: Part) => Handle
}

/** One queue for every Request of a Chat: a Request waits until the one before it is settled, and the first that stands is shown. */
export class Queue {
  readonly #standing: Standing[] = []
  #shown: Standing | undefined
  #placed: Handle | undefined

  /** The Request waits behind each Request that came before it. */
  add(request: Standing): void {
    this.#standing.push(request)
    this.#show()
  }

  /** Each Request is settled — answered, withdrawn or dismissed — so it goes, and the next that still stands is shown once. */
  settled(...requests: Standing[]): void {
    let gone = false
    for (const request of requests) {
      const at = this.#standing.indexOf(request)
      if (at === -1) continue
      this.#standing.splice(at, 1)
      gone = true
    }
    if (gone) this.#show()
  }

  #show(): void {
    const first = this.#standing[0]
    if (first === this.#shown) return
    // A placement the core already took down, because its plugin unloaded, lets go here a second time harmlessly.
    this.#placed?.dispose()
    this.#placed = undefined
    this.#shown = first
    if (first !== undefined) this.#placed = first.place(first.part)
  }
}

const queues = new WeakMap<ChatSession, Queue>()

/** The Chat's one queue of Requests: a question and an approval share it. */
export function queueOf(chat: ChatSession): Queue {
  const standing = queues.get(chat)
  if (standing !== undefined) return standing
  const queue = new Queue()
  queues.set(chat, queue)
  return queue
}
