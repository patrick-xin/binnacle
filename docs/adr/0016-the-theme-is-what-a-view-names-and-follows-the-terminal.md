---
status: proposed, subject to change
---

# The theme is what a view names, and it follows the terminal

The theme is everything a view names by what it means and binnacle makes concrete — colour, glyphs, frames, spacing, the surface's own words, how much a fold shows — so a value the layout picks itself is a gap in it. Its default derives colours from the palette the terminal reports, readable on the background it has, and falls back to the terminal's sixteen when it reports nothing. A person's theme may name any colour, for each part of the screen at the grain a person asks for, by names adopted from an established theme vocabulary.

## Considered Options

- **Ship a look of binnacle's own, in exact colours, as the default.** Distinctive, and alike in every terminal. Rejected because it overrides the palette a person chose for everything else they run. As a person's theme it loses nothing.
- **Keep the default in the sixteen colours, deriving nothing.** No code, and the terminal draws every colour. Rejected because sixteen colours cannot give each part of the screen its own colour and stay readable on every background.
- **Keep the theme to colour, and leave spacing, frames and words to views.** One meaning. Rejected because a person asks for square corners or a tighter transcript as often as another colour, and an author should not restate binnacle's drawing to change one number.
- **Keep binnacle's few broad tones, and add finer names beside them.** No view changes. Rejected because two names for one colour make an author guess which wins.

## Consequences

- Renaming the tones changes `Tone` in the author API, so authors who named the old ones break.
- binnacle owns its colour derivation, held by tests on worked palettes.
