---
'binnacle': patch
---

The composer's rules are now the box of its Layout. The box draws them in the `border` Tone. An author takes them away with one Layout: `binnacle.layout('composer', { ...COMPOSER_LAYOUT, border: false })`. `COMPOSER_LAYOUT` is exported from `binnacle/plugins/composer`.

An empty draft draws its line through the Look `composer.empty`, `(width) => line`, of the type `EmptyLook`. So an author shows a hint, such as `Ask anything` in the dim Tone. Its default draws nothing.

A draft taller than the rows shown tells the rows hidden above and below it, as before. It tells them in rows of its own, in the `muted` Tone, inside the rules.
