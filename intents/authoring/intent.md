# Intent: an author changes any part of binnacle, alone, in a small change

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-08

## Problem

binnacle's [product Intent](../binnacle/intent.md) promises that a person can ask an author agent to change anything binnacle draws or answers. binnacle has been built three times, and each time an author could rearrange or replace the whole screen, but not one piece of a feature. A feature drew everything, held its keys, and talked to dsh all in one place. Moving a question to the side, or changing how its choices are picked, meant rewriting the whole feature.

The combinations people may want are endless. We cannot build or check each one. What we can do is make each kind of change possible on its own, so that changes combine.

A prototype of Requests showed both halves: changes to where something goes and which keys do what were a few lines each, while changes to how a feature behaves copied most of the feature.

## Proposed outcome

1. An author changes **where** something is drawn, **how** it looks, **which keys** do what, and **how** it behaves, including **when** it shows. Each kind of change is made the same way for the whole screen as for one small piece of it.
2. A change about one of these kinds touches only that kind. It keeps the rest of the feature as it is, and copies nothing else.
3. A feature's talk with dsh, and what keeps it safe, stay with binnacle. Changing how a feature looks or flows never means redoing them.
4. An author is the author agent, or a person who writes a plugin by hand. Both can do the same things.
5. A person picks an author agent for the session, as dsh's Creator mode does, and asks it for a change.
6. A change is saved in the person's profile. It applies to every later session and survives a restart, until the person undoes it.
7. Each built-in feature uses only what an author can use, so it is a default to replace and an example to copy.
8. A person can still turn a whole feature off.

## Affected users and systems

- **A person** who wants binnacle to look or act their own way.
- **An author agent**, and **a person who writes a plugin**.
- **The Lead and the builders:** each feature is tried by an author before it is done.
- **dsh:** its profiles hold a person's changes, as they hold any bundle.

## Constraints

1. Authoring is built one feature at a time: build the feature, try it as an author, refine it, then the next.
2. A feature is done only when an author has tried it. That author knows only what any author gets from binnacle, and is from another family than the builder.
3. Each feature's Intent holds a few changes that a person might ask for, written by the Maintainer. A trial makes at least one change of each kind, and the author also makes up some of its own.
4. A change that an author cannot make in a small change is a gap, and it is fixed before the feature is done.
5. There is no way to share a change before 1.0. A change is a dsh bundle, and it is shared the way bundles are.
6. The product's constraints hold: there is no promise of stability before the first stable release.

## Stages

Each stage ends in something the Maintainer can try under dsh.

1. **Requests.** An author makes each of these changes small: space selects a choice where more than one can be chosen; tabs, or a click on a header, move between questions; a preview of every answer shows before they are sent; clicks do nothing; a Request draws as a dialog; a Request draws on the side.
2. **The features built so far.** The core, gestures, the transcript, the composer and the status line are each tried by an author, and refined. The product's next stage is built the same way after this.
3. **Asking inside binnacle.** A person picks an author agent, asks for a change while the session runs, sees it take effect, and undoes it. A broken change does not stop the session.

## Specs

None yet. The prototype and its trial are in [#180](https://github.com/patrick-xin/binnacle/issues/180).

## Open questions

None.
