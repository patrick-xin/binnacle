# 2. Five layers, and the registrations an author shares

- Status: accepted
- Date: 2026-09-25

## Context

binnacle is customized by asking an author agent, and the agent changes more than drawing. A dsh preset can run a different tool loop and log event kinds no built-in view has seen; the agent has to draw them, act on them and place them. If the built-in surface reaches for something an author cannot, the author's version is always second-class, and every such shortcut is a place the two drift apart.

The repository is maintained by agents. An agent has to find where a behaviour lives, change it, and prove the change without a person watching a terminal. Code that mixes the terminal, the runtime and drawing can only be tested through a terminal; code where every module may import every other has no place a behaviour obviously lives.

## Decision

**Five layers, each knowing only what is below it:**

| Layer  | Holds                                                                                                                       | Knows                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| facts  | dsh's session log, adapted to typed facts                                                                                   | dsh only                          |
| models | pure folds: turns, the agents tree, status                                                                                  | facts                             |
| views  | fact → what is drawn, one module per kind of content                                                                        | facts, models, the ui's components |
| ui     | the components, layout, the gesture table ([ADR 1](0001-content-offers-affordances-the-surface-owns-gestures.md)), UI state | pi-tui                            |
| host   | the terminal and the harness runtime                                                                                        | everything; the only impure layer |

The components a view draws with are few and exposed — text, code, markdown, card, collapsible, list, table, field, link — each drawn by the pi-tui component that already draws it. The contract types live in a leaf layer, `contract`, that imports nothing of ours and that every layer may know. [`layers.json`](../../packages/binnacle/layers.json) states exactly what each layer may import, and `pnpm test` holds it.

**An author and the built-in surface register through the same five doors**, each an effect disposed with its plugin:

1. **facts** — an adapter for event kinds a tool loop logs;
2. **views** — how a kind of content is drawn, new or replacing a built-in one;
3. **affordances and commands** — what a person can do;
4. **bindings** — how they reach it;
5. **placements** — where it goes, a screen or a side panel.

An event kind with no view is drawn by a fallback — its type, one line, and `expand` to the raw record — so a new tool loop is never invisible.

## Alternatives considered

**Three layers: a drawing grammar, models, and features.** Fewer boundaries, and the grammar owns everything shared. It lost because a grammar layer becomes the place anything shared goes — the widget contract, every renderer, the keyboard, the registries — until one hub imports every renderer and every renderer imports it back. Separating views from the ui they draw with, and facts from models, gives each question — what happened, what it means, how it looks, how it answers — one home.

**Give plugins pi-tui's component tree.** The most power for an author, and nothing to design. It lost because a plugin holding the tree can do what no registration records, so nothing can dispose it or test it in isolation, and a pi-tui change breaks every plugin at once.

**Declarative specs by shape — list, pager, form, notice — that the surface renders.** A plugin states data, never a render function. It lost because a shape says what something looks like, not what a person can do with it; a table that offers nothing and a picker are both "lists".

## Consequences

- Below the host everything is a function of facts, UI state and a size, so a test feeds a log and reads the screen as text, with no terminal.
- An import across layers the wrong way is a defect a gate can find, and the graph has no cycles to find one through.
- The built-in surface has no private door: anything it draws, an author can draw, replace or remove.
- A view tree rebuilt per frame costs time on a long session; views are cached per fact and invalidated when their fact or its UI state changes.
