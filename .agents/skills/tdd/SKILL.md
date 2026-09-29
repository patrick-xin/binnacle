---
name: tdd
description: The red → green loop as binnacle runs it. Load it before writing the first test of any change to packages/ or scripts/ — a feature, a fix, a gate — and follow it for every test after.
---

# Test-driven development in binnacle

The rules are `AGENTS.md`'s, under *Tests*: they bind, and this skill does not repeat them. It is how to follow them, one cycle at a time. [examples.md](examples.md) holds a good and a bad test for each way a test goes wrong here.

## Before the first test

1. **Name the seams.** A seam is where the change is observed from outside: its spec names them — an issue's *Seams*, or the maintainer's word. Write them down. A test at a seam nobody agreed is not written; ask first (in a Charge, with `ask_shepherd`).
2. **List the behaviours**, each a sentence a person or a caller would say: "Enter on a focused fold opens it". That sentence is its test's name. Order them so each builds on the last. The first is the thinnest that crosses every seam it needs, end to end.

## One cycle

1. **Write one test**, at one seam, for one behaviour. Its expected value comes from outside the code: a literal, a worked example, what upstream does. What a person sees is lines, written out as literals; where a click lands is regions. A change to what is laid out asserts both, at a width where a line wraps as well as at one where none does: a region's rows go wrong where a line wraps.
2. **Run it alone, and read how it fails.** From `packages/binnacle`:

   ```sh
   node --test --test-name-pattern '<its name>' test/<module>.test.ts
   ```

   From the root, a script's test is `node --test scripts/<script>.test.mjs`. It is red only when it fails **at its assertion, for the reason its name gives**. A missing export, a type error or a `TypeError` thrown on the way is not red: add the least code that lets the assertion run — an export that returns nothing — run it again, and read the real failure.
3. **Write the least code that passes it.** Nothing a later test will need: no option, branch or parameter a test has not asked for yet.
4. **Run the file, then `pnpm test`.** Green is every gate too: lint, types, citations, the author API's JSDoc, layers.
5. **Take the next behaviour, and let this cycle change the list.** A surprise is a new behaviour; one that fell out for free gets no test of its own.

Never write a second test while the first is red, and never write tests ahead in a batch: a test written before the code it tests asserts a shape that was imagined.

## A test that passes the first time it runs

It proves nothing yet. Either the behaviour already exists — say so, and keep the test only if nothing else holds it — or the test cannot fail: break the code it covers, watch it fail, and restore it. A guard or a type-level test is always shown to bind this way.

## On the record

A commit's message says, for each test it adds, how it failed before the code made it pass: one line, in the failure's own words. A guard says how it was broken, and what it said.

## Where binnacle's seams are

| Seam | In | Out |
| --- | --- | --- |
| a script's exported function | what the script reads | what it reports |
| the gesture table (`binnacle:packages/binnacle/src/ui/gestures.ts#meaning`) | a gesture and the regions it lands on | an action, or nothing |
| UI state (`binnacle:packages/binnacle/src/ui/state.ts#act`) | the state, an action, what is on screen | the state after |
| what a view draws (`binnacle:packages/binnacle/src/views/entries.ts#drawEntry`) | an entry, and authors' views | lines, laid out at a width |
| a pane (`binnacle:packages/binnacle/src/panes/transcript.ts#TranscriptPane`) | facts, gestures, a width | lines, drawn by `drawText` |
| a registration (`binnacle:packages/binnacle/src/api.ts#Registrations`) | what an author registers | what is drawn, and gone once disposed |
| the host | bytes typed into a terminal emulated with xterm, a session's events | the screens read back, what was sent, the exit asked |
| the built bundle | `dist/` under plain `node`, and the real launcher | it loads; it boots |

`test/support/` already builds the terminals and the session a test of the host fakes, and the facts more than one test feeds; extend those rather than write another.
