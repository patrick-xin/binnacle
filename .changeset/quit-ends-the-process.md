---
'binnacle': patch
---

binnacle ends its process after a quit, though a socket is left open, such as a proxy's. Before, behind an HTTPS proxy, two ctrl+c cleared the screen, and the shell got no prompt back. A process that ends on its own still ends at once.
