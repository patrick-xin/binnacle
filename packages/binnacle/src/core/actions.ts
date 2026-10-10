import type { Action, Binding, Point } from '../api.ts'
import { matchesKey } from '../terminal/keys.ts'
import type { KeyId } from '../terminal/keys.ts'
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
  scroll(notches: number, at: Pointer): void
}

export interface CoreActions {
  readonly actions: Readonly<Record<string, Action>>
  /** Runs what takes a notch of the wheel, with the cell under its pointer for the core's scroll. */
  wheel(at: Pointer, take: () => void): void
}

/** The core's own gestures, as actions that the core sets beneath an author's: one place, so that a second ctrl+c is told from the first. */
export function coreActions(acts: Acts): CoreActions {
  let clearedAt = Number.NEGATIVE_INFINITY
  // An action's `at` is a cell in a Part's lines, so the scroll reads the cell on the screen from here.
  let pointer: Pointer | undefined
  const scroll = (notches: number): void => {
    if (pointer !== undefined) acts.scroll(notches, pointer)
  }
  const actions: Record<string, Action> = {
    'binnacle.clear': {
      keys: ['ctrl+c'],
      description: 'Clear the draft; pressed twice on an empty draft, quit binnacle',
      run: () => {
        const now = acts.now()
        if (now - clearedAt < QUIT_WITHIN_MS) acts.quit()
        clearedAt = now
      },
    },
    'binnacle.interrupt': { keys: ['escape'], description: 'Interrupt the turn that runs', run: () => acts.interrupt() },
    'binnacle.suspend': { keys: ['ctrl+z'], description: 'Suspend binnacle, back to the shell', run: () => acts.suspend() },
    'binnacle.focus.next': {
      keys: ['shift+tab'],
      description: 'Move the Focus to the next Place whose Part takes keys',
      run: () => acts.focusNext(),
    },
    'binnacle.scroll.up': { keys: ['wheelup'], description: 'Scroll the Place under the pointer up', run: () => scroll(1) },
    'binnacle.scroll.down': { keys: ['wheeldown'], description: 'Scroll the Place under the pointer down', run: () => scroll(-1) },
  }
  return {
    actions,
    wheel: (at, take) => {
      pointer = at
      try {
        take()
      } finally {
        pointer = undefined
      }
    },
  }
}

/** One action set, held apart, so that one action set twice keeps two places beneath its id. */
export type SetAction = Held<{ readonly id: string; readonly action: Action }>

export type SetBinding = Held<{ readonly name: string; readonly keys: Binding }>

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
    return action === undefined ? this.#bound(id, []) : this.#keysOf(action)
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

  /** The ids of the enabled actions that a gesture is bound to now: each that acts wherever the Focus is, and each that acts in the Place with the Focus. */
  actionsOf(gesture: string, focus: string | undefined): readonly string[] {
    return this.#tops()
      .filter((entry) => this.#keysOf(entry).some((key) => bindsTo(key, gesture)))
      .filter((entry) => {
        const { place } = this.#placeOf(entry)
        return place === undefined || (focus !== undefined && actsIn(place, focus))
      })
      .map(({ item }) => item.id)
  }

  /** A notch of the wheel, by its gesture's name, to the actions with no Place. */
  wheel(name: string): void {
    const taker = this.#tops().find((entry) => this.#placeOf(entry).place === undefined && this.#keysOf(entry).includes(name))
    if (taker !== undefined) this.#run(taker, undefined)
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
    const own = hidden.find((action) => action.keys !== undefined)?.keys ?? []
    // A kind named as its id holds the same bindings, which would apply twice.
    return this.#bound(id, kind === undefined || kind === id ? own : this.#bound(kind, own))
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

  /** The keys that the bindings by the name give, oldest first, over the keys beneath them: a list replaces them, and a function is given them. */
  #bound(name: string, beneath: readonly string[]): readonly string[] {
    return this.#bindings
      .filter(({ item }) => item.name === name)
      .reduce((keys, { item }) => (typeof item.keys === 'function' ? item.keys(keys) : item.keys), beneath)
  }
}

// A mouse gesture is bound by its name; a key is matched as the terminal sends it.
function bindsTo(key: string, gesture: string): boolean {
  return key === gesture || matchesKey(gesture, key as KeyId)
}

function actsIn(own: Action['place'], place: string): boolean {
  if (own === undefined) return false
  return typeof own === 'string' ? own === place : own.includes(place)
}
