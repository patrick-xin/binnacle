# Composer

Row `binnacle-composer` · Code `binnacle:packages/binnacle/src/plugins/composer/index.ts#apply` · Intent: none yet

## What a person can do

- Type a draft in the Chat's composer Place, between two rules, with pi-tui's editor keys.
- Make a new line with shift+enter; a paste keeps its new lines.
- Send the draft as a prompt with enter, or steer the turn that runs. The draft goes into its history.
- Interrupt the turn that runs with esc.
- Clear the draft with ctrl+c. On an empty draft, ctrl+c pressed twice within half a second quits.
- On a stored session, enter keeps the draft, as nothing can be sent.

## What an author can change

- Replace the composer: turn off its row, and place a Part of their own in the `composer` Place.

## How it is built

- **The copied editor.** The composer is pi-tui's editor, copied under `packages/binnacle/src/terminal/components/`, and it stays until a person or an author needs something it cannot do.
- **The keys of the Chat.** Enter sends, or steers. Shift+enter is a new line, with pi's fallbacks where a terminal cannot tell it from enter. pi's fallback for macOS's Terminal and for Windows reads the shift key through a native helper, and binnacle does not copy it: there, ctrl+j or a backslash before enter is a new line. Esc interrupts; a steer that was queued runs after the interrupt, as in dsh. Ctrl+c clears, and pressed twice on an empty draft it quits. Ctrl+z suspends.
- **Its keys come from the Gesture Table**, as the editor reads them there.
- **It shows at most 24 rows** of a long draft.

## Built by

Stage 2 (before Specs). PR [#153](https://github.com/patrick-xin/binnacle/pull/153): esc interrupts, ctrl+c clears and quits.
