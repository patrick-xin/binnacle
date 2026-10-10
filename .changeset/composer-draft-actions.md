---
'binnacle': minor
---

An author changes how the composer sends without copying it. The draft is the model `composer`: its state's `text` is the draft as it would be sent, a large paste's content in full, and setting it replaces the draft. Enter runs the action `composer.send` and shift+enter runs `composer.newline`, actions of the Place `composer.input` that `binnacle.bind` binds, so ctrl+s can send while enter makes a new line. Set `composer.send` and run `beneath()` to keep what it did, or leave it out to do something else, such as queue the draft. Ctrl+c on a draft is the composer's `binnacle.clear`. A draft of whitespace sends nothing. The type `ComposerState` is exported from `binnacle/plugins/composer`.

The composer is the Layout `composer`, a row with the Place `composer.input`, and the Chat draws `{ layout: 'composer', size: 'content', unless: 'request' }` where it drew `{ place: 'composer' }`. The Chat's Focus starts in `composer.input`. A Part placed in the Place `composer` no longer draws: place it in `composer.input`, or set the Layout `composer`.
