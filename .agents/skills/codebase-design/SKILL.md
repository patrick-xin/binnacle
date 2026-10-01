---
name: codebase-design
description: How binnacle designs deep modules — where behaviour lives, where a seam goes, what a test crosses. Use when designing or changing a module's interface, deciding where a seam or a behaviour goes, looking for deepening opportunities, making code more testable or easier for an agent to find its way in, or when another skill needs the vocabulary.
---

# Codebase design

Design **deep** modules: much behaviour behind a small interface, at a seam a test crosses. Callers get **leverage**, maintainers **locality**. The words are the glossary's, under *Design's* ([the glossary](../../../docs/glossary.md)): **module**, **interface**, **deep** and **shallow**, **leverage**, **locality**, the **deletion test**, and binnacle's own **seam**. Use them exactly. **Adapter** is an author's word here (an event made into a fact), never a design word: what satisfies an interface is its **implementation**, and a test's stand-in is a **fake**.

## binnacle's deep modules

The layers and what each may import are `packages/binnacle/layers.json`'s and [the architecture](../../../docs/architecture.md)'s. What design here keeps deep:

- **The blocks a view returns** (`binnacle:packages/binnacle/src/ui/node.ts#Node`). A block promises how it is drawn **and how it answers**: whether it scrolls, where focus goes, how it is dismissed, what it does when it overflows its room. That promise is kept by the block, wherever it is placed; no placement decides it again. The host once gave placed screens a scroll and placed lines none, so an ask in the composer's place was cut off (#85).
- **The registrations** (`binnacle:packages/binnacle/src/api.ts#Registrations`): one interface an author and every built-in feature share, stacking and disposing the same way for both.
- **The key table** (ADR 8) and **the transcript model**: one answer each to what a key means, and what a session holds.

**The host is shallow on purpose**: it touches the terminal, the process and the clock, and passes the rest on. Behaviour that grows in the host — state held in its closures, a rule it decides for one slot — is behaviour a deeper module has not taken yet, and it is tested only through the most expensive seam there is. Move it down, and the host shrinks.

## Principles

- **Depth is a property of the interface.** A deep module may be made of small parts inside; they are not part of its interface, and its own tests may reach them through **internal seams** it never exposes.
- **The deletion test.** Imagine the module deleted: does its complexity vanish, or reappear in each caller? A rule that would reappear in each caller belongs in the module; a module whose complexity vanishes only passed calls on.
- **The interface is the test surface.** Callers and tests cross the same seam. A test that has to reach past it says the module is the wrong shape.
- **One implementation is a hypothetical seam; two make it real.** Binnacle's second is usually a fake in a test, or an author's view beside the built-in one. Put in no seam that nothing varies across.
- **Accept what you depend on; return what you decide.** Time, ids and size arrive as arguments (`AGENTS.md`), and a module that returns what it decided is tested without a terminal.

## Going deeper

- **Deepening a cluster of modules, given what they depend on**: [DEEPENING.md](DEEPENING.md).
- **Designing an interface several ways before choosing one**: [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
