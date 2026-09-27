# 14. No text a node carries reaches the terminal as a control

- Status: accepted; extends [ADR 10](0010-a-view-draws-with-blocks-binnacle-grows-on-request-in-the-themes-tones.md)
- Date: 2026-09-27

## Context

What a view draws is text a tool returned, an answer streamed, or an author's own data, and a terminal obeys control sequences in any text it is handed: one that clears the screen clears it, one that writes the clipboard writes it, one that sets the title sets it, and a colour run bleeds into the rows after it. So content could act on the terminal instead of being read, whatever view drew it.

pi-tui already strips what it knows — ANSI, OSC and APC sequences, keeping the visible text — in one function the renderer's own tests read lines through (pi-tui's terminal-sequence strip, at v0.87.1).

## Decision

**No text a node carries reaches the terminal as a control. Every string a node carries goes through one treatment, in one place in the ui where nodes are laid out, before the theme's tones are applied: pi-tui's strip removes ANSI, OSC and APC sequences, and every other control character but tab and newline is drawn visibly — a C0 control or DEL as its control picture, a C1 control as `�`, a carriage return before a newline as the line ending it is.**

The treatment is one place, not a habit at every draw: a kind of node added to the vocabulary fails to compile until its carried strings go through it. Tones are applied after, so the theme's own styling is untouched.

## Alternatives considered

**Pass a tool's own colours through while stripping the rest.** Its output would look as it did in the tool. It lost because a colour run is not text but an instruction to the terminal, and one left open bleeds into every row drawn after it; the renderer owns a line's styling, and content cannot be trusted to close what it opens.

**Draw each sequence as visible characters, `␛[31m` and all.** Nothing would be hidden. It lost because a person reads the message, not the wire: the payload of a clipboard write or a title set is noise at any length. The escape character itself still surfaces this way where pi-tui's strip does not know the sequence — as `␛`, its text following — which is the control-picture rule, not this alternative.

## Consequences

- A tool's own colours are lost; what it returned is drawn in the theme's tones. Keeping them was considered and refused above.
- Tab and newline pass through untouched: layout already gives them their meaning.
- What a node carries that is not drawn — an id, a count — is not treated; only the strings the layout draws are.
- The composer and what pi-tui draws itself are outside this decision: they are not nodes a view drew.
