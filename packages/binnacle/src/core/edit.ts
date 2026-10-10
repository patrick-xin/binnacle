import type { Edit, Layout } from '../api.ts'
import type { Held } from './service.ts'

/** An edit, and the name of the plugin that made it, which ranks it. */
export interface Made {
  readonly edit: Edit
  readonly plugin: string | undefined
}

/** A node of the Layout as set or as an insert added it, and what the edits put beside it and in its place. */
interface Slot {
  readonly node: Layout
  /** An inserted node's place in the order of edits, which orders it among the nodes inserted beside one anchor. */
  readonly rank: number
  /** A row's, a column's or a `first`'s children, or a float's `over` then its `float`. */
  readonly children: readonly Slot[]
  /** Drawn only where the node's parent is a row, a column or a `first`: beside the root, `over` or `float`, an insert draws nothing. */
  readonly before: Slot[]
  readonly after: Slot[]
  /** What stands in its place after a replace, or `null` after a remove. */
  stands?: Layout | null
}

const NOTHING: Layout = { column: [] }

const kindOf = (edit: Edit): number => (edit.insert !== undefined ? 0 : edit.replace !== undefined ? 1 : 2)

// Plain comparison of code units, not of the locale's, so the order is the same on every machine.
const compare = (a: string | undefined, b: string | undefined): number => {
  if (a === b) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return a < b ? -1 : 1
}

const ranked = (a: Held<Made>, b: Held<Made>): number =>
  kindOf(a.item.edit) - kindOf(b.item.edit) ||
  Number(b.builtIn) - Number(a.builtIn) ||
  compare(a.item.plugin, b.item.plugin) ||
  compare(JSON.stringify(a.item.edit), JSON.stringify(b.item.edit))

function slotOf(node: Layout, rank = -1): Slot {
  const children = node.row ?? node.column ?? node.first ?? (node.over === undefined ? [] : [node.over, node.float])
  return { node, rank, children: children.map((child) => slotOf(child)), before: [], after: [] }
}

/** Depth first, children in order and `over` before `float`. A named Layout that the node draws is not looked in. */
function find(slot: Slot, anchor: string): Slot | undefined {
  if (slot.node.place === anchor || slot.node.layout === anchor) return slot
  for (const child of slot.children) {
    const found = find(child, anchor)
    if (found !== undefined) return found
  }
  return undefined
}

function built(slot: Slot): Layout | undefined {
  if (slot.stands !== undefined) return slot.stands ?? undefined
  const { node, children } = slot
  const listed = (): Layout[] => children.flatMap(beside).flatMap((each) => built(each) ?? [])
  if (node.row !== undefined) return { ...node, row: listed() }
  if (node.column !== undefined) return { ...node, column: listed() }
  if (node.first !== undefined) return { ...node, first: listed() }
  if (node.over !== undefined) return { ...node, over: built(children[0]!) ?? NOTHING, float: built(children[1]!) ?? NOTHING }
  return node
}

const beside = (slot: Slot): Slot[] => [...slot.before.flatMap(beside), slot, ...slot.after.flatMap(beside)]

/** The Layout with each edit applied, in the order that ranks them, whichever was made first. */
export function edited(layout: Layout, edits: readonly Held<Made>[]): Layout {
  if (edits.length === 0) return layout
  const root = slotOf(layout)
  const sorted = edits.toSorted(ranked).map(({ item }) => item.edit)
  const added: Slot[] = []
  // An insert beside a node that another insert adds waits for it, so inserts apply in rounds until one adds nothing.
  let waiting = sorted.flatMap((edit, rank) => (edit.insert === undefined ? [] : [{ edit, rank }]))
  for (let left = waiting.length; left > 0; left = waiting.length) {
    waiting = waiting.filter(({ edit, rank }) => {
      const anchor = (edit.after ?? edit.before)!
      const found = find(root, anchor) ?? added.reduce<Slot | undefined>((first, slot) => first ?? find(slot, anchor), undefined)
      if (found === undefined) return true
      const slot = slotOf(edit.insert!, rank)
      const side = edit.after === undefined ? found.before : found.after
      // An insert that waited a round for its anchor still goes where its rank puts it, not after those that did not wait.
      side.splice(side.findLastIndex((other) => other.rank < rank) + 1, 0, slot)
      added.push(slot)
      return false
    })
    if (waiting.length === left) break
  }
  for (const edit of sorted) {
    const anchor = edit.replace ?? edit.remove
    if (anchor === undefined) continue
    const found = find(root, anchor)
    if (found !== undefined) found.stands = edit.with ?? null
  }
  return built(root) ?? NOTHING
}
