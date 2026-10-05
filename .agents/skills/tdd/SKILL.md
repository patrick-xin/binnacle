---
name: tdd
description: The test loop in binnacle, one behaviour at a time. Load it before the first test of a change to code or to a script.
---

# Test-driven development

A test is proven when a break of the code that it covers makes it fail. Writing the test first is the fastest way to get there, so do it when you can.

## Before the first test

1. Name the seams. A seam is a public boundary where a test observes the change from outside. The Spec names them.
2. List the behaviours. Each one is a sentence that a person or a caller would say, and the name of one test.
3. Order the behaviours so that each builds on the one before. The first is the thinnest one that crosses every seam.

If a test needs a seam that the Spec does not name, ask the Lead first.

## One cycle

1. Write one test, at one seam, for one behaviour.
2. Run it alone: `node --test --test-name-pattern '<name>' <file>`.
3. Read how it fails. It is red only when it fails at its assertion, for the reason that its name gives.
4. If it fails on the way, such as a missing export, add the least code that lets the assertion run, and go to step 2.
5. Write the least code that passes the test.
6. Run the file, then `pnpm test`.
7. Take the next behaviour. If the cycle taught you something, change the list.

Write one test at a time. A test written ahead of its code asserts a shape that you imagined.

## What a good test does

- **Its expected value comes from outside the code:** a literal, a worked example, or what upstream does. A value computed the way the code computes it agrees with any bug.
- **It asserts the contract**, not the implementation. A test that must change when the implementation changes reaches past the seam.
- **It uses the real implementation.** Fake only what is outside binnacle's control, such as the terminal and the model.
- **What a person sees is lines**, written out as literals.

## A test that passes the first time

It proves nothing yet. Either the behaviour exists already, or the test cannot fail.

1. Break the code that the test covers.
2. Run the test, and see it fail.
3. Restore the code.

A check or a type-level test is always proven this way.
