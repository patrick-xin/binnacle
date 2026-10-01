# On the main screen, a printed row never changes

On the terminal's main screen the scrollback holds the history, and changing a row that has scrolled out of the window makes pi-tui clear the scrollback and print the whole session again. binnacle changes rows after drawing them — a result replaces `running…`, a fold opens — so on the main screen it never changes a row it has printed. It prints an entry, in log order, once nothing later can change it, and draws what can still change below, above the composer.

## Considered Options

- **Change the row, and let the session be printed again.** Nothing to build. Rejected because the cost is paid at every result, grows with the session, and strands a person reading the scrollback.
- **Draw every change as a new row.** Nothing held back. Rejected because a finished call would read `running…` forever, and an author's view would need two contracts, one for each screen.
- **Hold back each turn until it ends.** Simpler. Rejected because a turn taller than the window scrolls away while it can still change.

## Consequences

- A change after printing — a view registered or invalidated, a theme, a fold — reaches the alternate screen, but on the main screen only what is still to be printed.
- A resize prints the session again, as pi-tui does on the main screen.
