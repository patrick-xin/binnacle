# A good and a bad test, for each way a test goes wrong here

Each pair tests the same behaviour. The bad one passes today and would go on passing when the behaviour broke, or break when nothing a person sees changed.

## The expected value is computed the way the code computes it

```ts
// Bad: draws the expected lines with the code under test, so it agrees with itself whatever it draws.
test('an answer folds its reasoning away', () => {
  const expected = layout(drawEntry(answer), 40, { expanded: new Set() }).lines.map(line => stripTerminalSequences(line).trimEnd())
  assert.deepEqual(lines(answer), expected)
})

// Good: the lines a person reads, written out.
test('an answer shows its text, folds its reasoning away, and says when it was cut short', () => {
  assert.deepEqual(lines(answer), ['∴ thinking', '… 1 more line', 'The build', '(interrupted)'])
})
```

## It reads what a component holds, not what it draws

```ts
// Bad: a getter added so the test can look inside; moving the state breaks it, and a pane that draws nothing passes it.
test('a click opens the fold', () => {
  pane.handleMouse(click)
  assert.ok(pane.state.expanded.has('tool:c1'))
})

// Good: the pane is asked what it draws, as pi-tui asks it.
test('a click on a fold opens it, and the pane claims the click', () => {
  assert.deepEqual(pane.handleMouse(click), { handled: true })
  assert.deepEqual(drawText(pane, 40).slice(1, 3), ['line one', 'line two'])
})
```

## It fakes what binnacle owns

```ts
// Bad: a hand-written gesture table stands in for the real one, so the test holds the fake's rules.
const meaning = () => ({ kind: 'invoke', region: 'tool:c1', affordance: 'expand' })

// Good: fake only the terminal and the model; the pane, the gesture table, the layout and pi-tui are the real ones.
const terminal = new XtermTerminal(40, 12)
const { commit } = await mount([], new FakeSession(logged), undefined, terminal)
```

## Its name says how, not what

```ts
// Bad: names a call, so it outlives the behaviour it was meant to hold.
test('act calls Set.delete on expand', () => { /* … */ })

// Good: names what a person sees.
test('expand opens a region, and again folds it', () => { /* … */ })
```

## Tests written ahead, in a batch

Writing the gesture table's key tests, the pane's and the host's, then the code, commits to a shape before any of it ran. Write the host's first test, crossing every seam once — a key typed, a fold opened, the screen read — make it pass, then add the next behaviour where the last one taught you it belongs.
