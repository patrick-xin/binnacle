# contract

What layers that otherwise know nothing of each other share: content offers affordances, a region of the screen carries them, a gesture lands on regions and means an action, or nothing. What a gesture means is `ui`'s gesture table; drawing and reading input are the layers' above.

- `index.ts` — the shared vocabulary: affordances and their pointer policy, regions, key bindings, gestures, actions, and how a thrown value reads.

## Keep

- Nothing here draws or reads input, and it imports nothing.
