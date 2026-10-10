import type { Action, Point } from '../api.ts'
import { matchesKey } from '../terminal/keys.ts'
import type { KeyId } from '../terminal/keys.ts'
import type { CoreAction } from './gestures.ts'
import type { Held } from './service.ts'

// pi's window for the second ctrl+c that quits.
const QUIT_WITHIN_MS = 500

/** The cell under the pointer, counted from 0, where a mouse gesture happened. */
export interface Pointer {
  readonly x: number
  readonly y: number
}

export interface Acts {
  now(): number
  quit(): void
  suspend(): void
  interrupt(): void
  focusNext(): void
  scroll(notches: number, at: Pointer | undefined): void
}

/** The core's own actions, in one place, so a second ctrl+c is told from the first. */
export function coreActions(acts: Acts): (action: CoreAction, at?: Pointer) => void {
  let clearedAt = Number.NEGATIVE_INFINITY
  return (action, at) => {
    if (action === 'binnacle.suspend') return acts.suspend()
    if (action === 'binnacle.interrupt') return acts.interrupt()
    if (action === 'binnacle.focus.next') return acts.focusNext()
    if (action === 'binnacle.scroll.up') return acts.scroll(1, at)
    if (action === 'binnacle.scroll.down') return acts.scroll(-1, at)
    const now = acts.now()
    if (now - clearedAt < QUIT_WITHIN_MS) acts.quit()
    clearedAt = now
  }
}

/** One action set, held apart, so that one action set twice keeps two places beneath its id. */
export type SetAction = Held<{ readonly id: string; readonly action: Action }>

export type SetBinding = Held<{ readonly name: string; readonly keys: readonly string[] }>

/** The actions that authors set, read from their lists as they stand at each gesture and each call. */
export class Actions {
  readonly #set: readonly SetAction[]
  readonly #bindings: readonly SetBinding[]

  /** Both lists are oldest first, a built-in's beneath an author's, and the service changes them in place. */
  constructor(set: readonly SetAction[], bindings: readonly SetBinding[]) {
    this.#set = set
    this.#bindings = bindings
  }

  keysOf(id: string): readonly string[] {
    const action = this.#set.findLast(({ item }) => item.id === id)
    return action === undefined ? (this.#bound(id) ?? []) : this.#keysOf(action)
  }

  run(id: string, at: Point | undefined): void {
    const top = this.#enabledBelow(id, this.#set.length)
    if (top !== undefined) this.#run(top, at)
  }

  /**
   * A key before the Part with the Focus, to the actions marked `first` of its Place; or after it, to the Place's other actions, then to the actions with no Place, `first` or not.
   * True when an action took it.
   */
  key(data: string, focus: string | undefined, first: boolean): boolean {
    const takers = this.#tops().filter((entry) => this.#keysOf(entry).some((key) => matchesKey(data, key as KeyId)))
    const placed = takers.map((entry) => ({ entry, ...this.#placeOf(entry) }))
    const inFocus = placed.filter(({ place }) => focus !== undefined && actsIn(place, focus))
    const taker = first
      ? inFocus.find((action) => action.first === true)
      : (inFocus.find((action) => action.first !== true) ?? placed.find(({ place }) => place === undefined))
    if (taker === undefined) return false
    this.#run(taker.entry, undefined)
    return true
  }

  /** A click that the Part in the Place did not take, by its gesture's name, such as `click` or `shift+click`. True when an action took it. */
  click(gesture: string, place: string, at: Point | undefined): boolean {
    const taker = this.#tops().find((entry) => actsIn(this.#placeOf(entry).place, place) && this.#keysOf(entry).includes(gesture))
    if (taker === undefined) return false
    this.#run(taker, at)
    return true
  }

  /** True while an action is set that acts in the Place, enabled or not, so that the Focus stays while one is disabled for a moment. */
  actsIn(place: string): boolean {
    return this.#set.some(({ item }) => actsIn(item.action.place, place))
  }

  #run(entry: SetAction, at: Point | undefined): void {
    entry.item.action.run(at, () => {
      // Found when it runs, never captured, so a plugin that unloads between them leaves the chain as it stands.
      const index = this.#set.indexOf(entry)
      const next = index === -1 ? undefined : this.#enabledBelow(entry.item.id, index)
      if (next !== undefined) this.#run(next, at)
    })
  }

  #enabledBelow(id: string, index: number): SetAction | undefined {
    return this.#set.slice(0, index).findLast(({ item }) => item.id === id && item.action.enabled?.() !== false)
  }

  /** The newest enabled action of each id, newest first. */
  #tops(): readonly SetAction[] {
    const seen = new Set<string>()
    return this.#set.toReversed().filter(({ item }) => {
      if (seen.has(item.id) || item.action.enabled?.() === false) return false
      seen.add(item.id)
      return true
    })
  }

  /** An action that names no keys, or no kind, keeps those of the action it hides, so that a plugin that changes what an action does need not repeat its keys. */
  #keysOf(entry: SetAction): readonly string[] {
    const { id } = entry.item
    const hidden = this.#hidden(entry)
    const kind = hidden.find((action) => action.kind !== undefined)?.kind
    return (
      this.#bound(id) ??
      (kind === undefined ? undefined : this.#bound(kind)) ??
      hidden.find((action) => action.keys !== undefined)?.keys ??
      []
    )
  }

  /** An action that names no Place keeps the Place and the `first` of the action it hides, so that an action set by the id of a Place's action acts only in that Place. */
  #placeOf(entry: SetAction): { readonly place: Action['place'] | undefined; readonly first: boolean | undefined } {
    const hidden = this.#hidden(entry)
    const placed = hidden.findIndex((action) => action.place !== undefined)
    const kept = placed === -1 ? hidden : hidden.slice(0, placed + 1)
    return { place: placed === -1 ? undefined : hidden[placed]!.place, first: kept.find((action) => action.first !== undefined)?.first }
  }

  /** The action and each action that it hides, by its id, newest first. */
  #hidden(entry: SetAction): readonly Action[] {
    const { id } = entry.item
    return this.#set
      .slice(0, this.#set.indexOf(entry) + 1)
      .filter(({ item }) => item.id === id)
      .toReversed()
      .map(({ item }) => item.action)
  }

  #bound(name: string): readonly string[] | undefined {
    return this.#bindings.findLast(({ item }) => item.name === name)?.item.keys
  }
}

function actsIn(own: Action['place'], place: string): boolean {
  if (own === undefined) return false
  return typeof own === 'string' ? own === place : own.includes(place)
}
