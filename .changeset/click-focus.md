---
'binnacle': patch
---

A click on the transcript folds or Marks what it lands on, and the keys stay in the composer: a person who folds a card while typing goes on typing. A Layout node takes `clickFocus: false`: a click inside it reaches its Part and its actions, and moves no Focus. The Chat sets it on the transcript, and `binnacle.edit('chat', { replace: 'transcript', with: { place: 'transcript', size: 'fill' } })` gives the transcript its click Focus back.
