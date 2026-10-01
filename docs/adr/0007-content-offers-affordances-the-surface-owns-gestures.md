# Content offers affordances, the surface owns gestures

When each widget decides what input means, the answer follows the widget, not the content: a table drawn with a list inherits a picker's wheel. So a view declares affordances on what it draws — expand, open, copy, grant — and one gesture table, binnacle's alone, gives every click, wheel, drag and key its meaning, with content that was not cut offering no `expand`, so no gesture reaches it. Policy belongs to the affordance: a grant refuses the pointer, so an approval is always a key pressed on purpose.

## Considered Options

- **Give each screen a role — read, choose, answer, grant — and derive its input from the role.** Smaller. Rejected because a role is per screen and an affordance is per piece of content, and a transcript holds content of every kind on one page.
- **Let the wheel step a list's cursor**, as many terminal lists do. Right where a window is centred on its cursor. Rejected as a rule because it stops being scrolling the moment a list fits or flows into columns. Under the table, a list that overflows still scrolls on the wheel, and its cursor follows keys and clicks.

## Consequences

- Focus that moves among whatever offers something, across a whole screen, is binnacle's to build, and so is the difference between its gesture table and the input rules pi-tui's own components carry.
- Whether content was cut is known only after layout, so affordances are computed when it is laid out, and a layout that cuts differently offers differently.
