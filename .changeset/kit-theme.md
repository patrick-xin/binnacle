---
'binnacle': patch
---

An author changes a colour or a glyph once, for everything drawn with it. `binnacle.theme(layer)` adds a theme layer of `colors`, `glyphs`, `edge`, `padding` and `gap`: only the tokens that it names change, the newest layer wins, and the layer goes when its plugin unloads. `binnacle.tokens` reads the tokens, and `binnacle.paint(tone, text)` draws text in a Tone. A colour is one of the terminal's sixteen by name, a 256-colour index, or an exact colour, with attributes. With no layer, binnacle draws in v0's default Tones, and a box's borders are drawn dim, in the `border` Tone. The package exports the types `ThemeLayer`, `Tokens`, `Tone`, `Glyph`, `Style`, `Colour` and `Sixteen`.
