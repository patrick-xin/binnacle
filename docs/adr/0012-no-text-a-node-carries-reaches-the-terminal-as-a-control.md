# No text a node carries reaches the terminal as a control

A terminal obeys control sequences in any text it is handed: one clears the screen, one writes the clipboard, a colour run bleeds into the rows after it. So every string a node carries goes through one treatment, in the one place nodes are laid out, before the theme's tones are applied: known sequences are stripped, and every other control but tab and newline is drawn visibly.

## Considered Options

- **Pass a tool's own colours through, stripping the rest.** Its output would look as it did in the tool. Rejected because a colour run is an instruction to the terminal, and content cannot be trusted to close what it opens.
- **Draw every sequence as visible characters.** Nothing hidden. Rejected because a person reads the message, not the wire.

## Consequences

- A tool's own colours are lost: what it returned is drawn in the theme's tones.
