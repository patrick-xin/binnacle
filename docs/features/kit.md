# Kit

Row `binnacle`, part of the core · Code `binnacle:packages/binnacle/src/core/model.ts#createModel` · Intent: [authoring](../../intents/authoring/intent.md)

The Kit is what an author builds a feature from, as binnacle's built-ins do. It is not a row that a person turns off. How to use it is in the package's [`AUTHORING.md`](../../packages/binnacle/AUTHORING.md).

## What a person can do

Nothing that a person sees changes yet.

## What an author can change

- Make a Model with `createModel(state)`: its `state`, `set(change)`, and `watch(changed)`.
- List a Part's Models in `Part.models`, so that the core draws the Part again after each of them changes, with no code of the author's.
- Name a Model with `binnacle.model(name, model)`, and find it with `binnacle.modelOf(name)`. The newest by a name wins, and it goes when the plugin that named it unloads.

The types are `binnacle:packages/binnacle/src/api.ts#Model` and `binnacle:packages/binnacle/src/api.ts#Watchable`.

## How it is built

- **A Model tells its watchers in a microtask after a change**, once for the changes made together. A watcher that changes the Model in its own call is told again after that call, never inside it.
- **A Part's Models are watched while the Part is placed.** Each change draws the Part again, as its Handle's `redraw()` does. The watch stops when the Part's Handle is disposed.
- **A named Model is held as a Part is**, in a list by its name, so it goes with its plugin.

## Built by

Spec [#183](https://github.com/patrick-xin/binnacle/issues/183) · Ticket [#186](https://github.com/patrick-xin/binnacle/issues/186): Models, and Parts that redraw with them.
