# Intent: a person selects and copies text with the mouse, as in a plain terminal

- **Author:** Patrick Xin
- **Role:** Maintainer
- **Status:** approved
- **Date:** 2026-10-12

## Problem

binnacle takes the mouse, so that a click folds a tool card and the wheel scrolls the transcript. A terminal that gives the mouse to an app no longer selects text itself. So a person who drags across an answer in binnacle selects nothing, and copies nothing. The only way out is the terminal's own bypass, such as shift and a drag, which few people know, and which selects across the whole screen, the composer and the status line too.

The [product Intent](../binnacle/intent.md) promises that a person can copy everything in the session, and that binnacle does at least what a plain terminal does.

## Proposed outcome

binnacle selects and copies as pi does.

1. A person drags across text to select it. When they let go, the text is copied to the system clipboard, and binnacle says so briefly, or says why it could not.
2. A selection stays inside the part of the screen where the drag began, such as the transcript. A drag past its top or its bottom scrolls it, and the selection grows.
3. A double click selects a word, and a triple click selects a line.
4. What is copied is the text as it is drawn, without colours, one line for each row. A paragraph that wraps comes out as the rows it wraps to.
5. A click still folds, picks and marks, as it does today. It acts when the button is let go on the cell where it was pressed. A press that moves selects, and clicks nothing. In a double or a triple click, the first click acts, and the others only select.
6. The selection is drawn on the selected text only, so it reads apart from the event the transcript's keys act on. Its colour is one of the theme's.
7. A selection stays while the person reads on: keys, the wheel and new output below it leave it, and keys do what they always do. The next press of the button clears it. So does a fold, a resize, or a change to the text it covers.
8. The copy reaches the clipboard on macOS, Windows, Linux, WSL and Termux, through each one's own tools. Over SSH, or where there is no clipboard tool, it asks the terminal to copy.

An author can:

9. replace how text reaches the clipboard;
10. stop the copy on letting go, and copy with a key instead, as codex does;
11. give the mouse back to the terminal entirely, so that the terminal selects as it does without binnacle, and clicks and the wheel do nothing in binnacle.

## Affected users and systems

- **A person** who reads the session and copies an answer, a command, a path or an error out of it.
- **An author**, who changes how copying works, or turns it off.
- **Terminals:** the product's list. Each terminal answers a request to copy in its own way, and some ignore it.
- **The system clipboard**, and the tools that reach it on each system.
- **pi:** binnacle follows how pi selects, and copies how pi reaches the clipboard, with credit.

## Constraints

1. The product's constraints hold. Text that is copied is not trusted, and copying it cannot control the terminal.
2. Windows is in scope, though the Maintainer cannot try it there. A copy that fails there says so.
3. Every click that works today still works, in the same place.
4. Each part of the screen that the mouse does nothing in, by an author's choice, is left to the terminal's own selection.

## Open questions

None.
