# 7. pi-tui windows, scrolls and selects the transcript

- Status: accepted
- Date: 2026-09-26

## Context

The transcript is taller than the terminal. Something has to decide which rows are shown, follow the end while the session grows, scroll when the wheel turns over content nothing claims, and select text on a drag.

pi-tui does all four, as read at v0.87.1. A `ScrollView` windows its content and follows its end; the alternate screen hands a wheel no component claims to a scroll view and owns selection. pi's own app stacks its transcript in a scroll view above its editor. binnacle's first screen harness windowed the transcript itself, and its UI state kept a scroll offset.

## Decision

**The screen draws the whole transcript, and pi-tui windows, scrolls and selects it.** The screen is every line and every region at a width. A `ScrollView` decides what is shown and follows the end; the alternate screen scrolls it on a wheel nothing claims and selects on a drag. UI state keeps what a person opened and what has focus, never where they scrolled or what they selected.

This decides nothing between pi-tui's alternate screen and its main screen.

## Alternatives considered

**Window the transcript in binnacle**: the screen draws only the rows that fit, and UI state keeps a scroll offset. The first harness did. It lost because it derived again what pi-tui already does — following the end, the wheel, selection — where binnacle takes what upstream exports.

## Consequences

- No region binnacle lays out overflows, so the gesture table's wheel rule ([ADR 1](0001-content-offers-affordances-the-surface-owns-gestures.md)) reaches only a region binnacle windows itself; the transcript's wheel falls through to pi-tui.
- A frame's cost grows with the whole transcript, not with what is visible.
- Scroll position and selection are pi-tui's state, so a pi-tui change to either reaches binnacle without a line changing here.
