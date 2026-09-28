# Theme

binnacle draws content in tones named by what it means, a glyph as a mark named by what it stands for, and a band in a background named by what the content it holds means; the theme gives each tone its colour, each mark its glyph and the tone it draws it in, and each background its colour. It says too how each kind of entry's folds start: how many rows each shows while folded, and whether it starts open. Markdown and the composer are drawn in the same tones.

A person changes any of it by asking an author, who registers the changes in one registration ([Authoring](authoring.md)); nothing is redrawn to do it.

## How it works

A view marks text, or a span within it, with a tone, never a colour ([ADR 10](../adr/0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)), and the theme gives each tone its colour (`binnacle:packages/binnacle/src/ui/theme.ts#tones`). A span may instead name a mark, and the theme draws the mark's glyph in the mark's tone, or in a tone the span names beside it (`binnacle:packages/binnacle/src/ui/theme.ts#marks`). A band node names a background, as a view names a tone, and the theme fills every line of the band with it (`binnacle:packages/binnacle/src/ui/theme.ts#backgrounds`); pi-tui's `Box` draws the padding and the fill (`pi:packages/tui/src/components/box.ts`). What the ui and the host draw themselves they draw with glyphs the theme holds too, beside the marks (`binnacle:packages/binnacle/src/ui/theme.ts#chrome`); a view names none of them, so what the ui and the host draw is as much the theme's as a mark is.

A card's border is drawn in `dim`. A prompt's band is filled with the `prompt` background. A markdown block is drawn in the tones and the terminal's attributes (`binnacle:packages/binnacle/src/ui/theme.ts#markdownTheme`), and the composer's frame and select list in the tones too (`binnacle:packages/binnacle/src/ui/theme.ts#editorTheme`). The words a fold says of itself — what it holds, what it cut, what opening and folding it are called — are the theme's as its glyphs are (`binnacle:packages/binnacle/src/ui/theme.ts#words`), so a person's theme can say them otherwise.

How a fold starts is the theme's, by the kind of entry it is drawn in (`binnacle:packages/binnacle/src/ui/theme.ts#binnacleTheme`): read by the key its views are registered under — an entry kind, a quiet kind's dsh type, an authored fact's name — falling back to its kind when no start is given for its key. A fold that names its own rows keeps them, whatever the theme says; one that leaves them out takes its kind's start, or three rows. `open` starts a kind's folds open, and a person's toggle folds one back, as it opens one that starts folded. A placed screen has no entry kind, so its folds name their rows themselves: the [Trajectory](trajectory.md)'s do.

binnacle's own starts, a person's to change: the thinking fold, context, the fallback and authored facts folded to nothing; a tool's and a result's output to three rows.

## Choices

- The tones are pi's names for what content means (`pi:packages/coding-agent/docs/themes.md`).
- Each tone is one of the terminal's own sixteen colours, so the person's palette decides how it looks, as it does for everything else they run. pi's own themes name exact colours instead.
- Each background is one of the terminal's own sixteen it fills with, so the person's palette decides how it looks, as a tone's does; the prompt band is filled with the terminal's bright black, the grey a band reads as on a light palette and a dark one alike.
- Each mark's glyph is one column wide and a glyph every terminal's fonts carry, so a mark never misaligns what it stands before.
- Which marks exist, the glyph each draws and the tone it draws it in, change on request; so do the tones and the backgrounds, and the colour each takes.
- How each kind's folds start — how many rows each shows, and whether it starts open — changes on request the same way; binnacle's own starts are those above.
- A fenced code block is not highlighted, so its lines are the terminal's own.
- The composer's frame is `dim`, as chrome nobody reads.
