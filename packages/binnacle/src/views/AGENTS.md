# views

How the transcript is drawn: each entry through the built-in view for its kind and the views authors register over it, and the whole screen at a width. Nodes, layout and the theme are `ui`'s; holding UI state and answering gestures are `panes`'.

- `cards.ts` — the tool cards' vocabulary in the author API: what a presenter declared, the parts a card row is handed, and the row.
- `entries.ts` — the built-in views: how each kind of entry is drawn and what its content offers, with authors' views drawn over them and fenced.
- `screen.ts` — the screen: the whole transcript and the UI state at a width, as lines, regions and what can take focus, keeping each entry's drawing while it stands.

## Keep

- A view returns nodes and declares what its content offers; none reads input or holds a pi-tui component.
