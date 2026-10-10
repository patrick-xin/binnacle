---
'binnacle': minor
---

An action with no `place` keeps the `place` and the `first` of the action it hides. It also keeps its `keys` and `kind`, as before. An author can change what a Place's action does, such as `request.choices.toggle`, without restating the Place. That action takes a gesture only in that Place.

An author's action with no `place` that hides a Place's action no longer takes gestures in other Places. To act from every Place, set an action of a new id.
