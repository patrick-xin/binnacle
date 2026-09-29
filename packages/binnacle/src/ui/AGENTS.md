# ui

What a view draws with and how a person's input changes what is shown: nodes laid out through pi-tui, the theme, the key table, the gesture table and UI state. The input vocabulary (gestures, actions, regions) is `contract`'s; scrolling, search and selection are pi-tui's; installing the key table and the merged theme, and touching the terminal, are the host's.

- `answer.ts` — a landed gesture answered: its meaning from the gesture table, applied to UI state, saying what changed and what was invoked.
- `gestures.ts` — the gesture table: what a gesture means on the regions it lands on, or nothing.
- `keys.ts` — the key table: binnacle's and pi-tui's bindings in one manager, the keys plugins offer for their screens, and what key bytes resolve to.
- `layout.ts` — a node at a width as a frame: the lines it draws and the regions placed on them; `under` finds the regions at a point.
- `node.ts` — the nodes a view draws with, and parsing a node an author's code returned.
- `pointer.ts` — pi-tui's mouse events as gestures.
- `readable.ts` — the treatment every string a node carries gets before layout, so no text a view draws acts on the terminal.
- `state.ts` — UI state: what a person opened and what has focus, and what an action does to it.
- `theme-changes.ts` — an author's theme registration, checked and copied as data where it enters.
- `theme.ts` — the theme binnacle draws in: tones, backgrounds, marks, the chrome's glyphs and words, markdown and composer styles; `themed` lays changes over it.

## Keep

- The gesture table is the one place a gesture is given a meaning, and `answer.ts` the one place a landed gesture becomes a change of UI state.
- `keys.ts` is the one place key bytes are matched to what they do; `pointer.ts` the one place pi-tui's mouse vocabulary is read; `readable.ts` the one place terminal sequences are stripped. The `owners` of `layers.json` hold each, naming the pi-tui symbols only these files, and the panes and the host that hand them on, may import.
- The container roles, `ask` and `show`, are a closed set in `node.ts`: a new one joins there, never in a plugin.
- A tone or a background is drawn in one of the terminal's own sixteen colours, so a person's palette decides what it looks like, as their terminal already does.
