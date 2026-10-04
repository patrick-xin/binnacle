---
name: architecture
description: How binnacle designs deep modules, where a behaviour belongs, and where a seam goes. Use when you design or change a module's interface, place a behaviour or a seam, or look for code to make deeper.
---

# Architecture

Design **deep** modules: much behaviour behind a small interface, at a seam that a test crosses. Callers get **leverage**. Maintainers get **locality**.

## Words

| Word | Means |
|---|---|
| **module** | Anything with an interface and an implementation: a function, a file, a layer |
| **interface** | Everything a caller must know: the types, the order of calls, the errors, the costs |
| **deep** | Much behaviour behind a small interface |
| **shallow** | An interface almost as large as what it hides |
| **seam** | A public boundary where behaviour can change without an edit, and where a test observes it |
| **leverage** | What a caller gets for each thing that it must learn |
| **locality** | A change, a bug or a fact stays in one place |
| **fake** | A test's stand-in for an implementation |

## Principles

- **Depth is a property of the interface.** A deep module can have small parts inside. Its own tests can reach them through internal seams that it never exposes.
- **The deletion test.** Imagine that the module is gone. If its complexity comes back in each caller, the module earns its place. If the complexity goes away, the module only passed calls on.
- **The interface is the test surface.** Callers and tests cross the same seam. A test that must reach past the seam says that the module has the wrong shape.
- **One implementation is a possible seam. Two make it real.** The second is often a fake in a test, or an author's code beside the built-in one. Add a seam only where something varies.
- **Take what you depend on, and return what you decide.** Time, ids and size arrive as arguments. A module that returns its decision is tested without a terminal.
- **The edge is shallow on purpose.** The part that touches the terminal, the process and the clock passes the rest on. Behaviour that grows there belongs in a deeper module.

## Going deeper

- To make a group of shallow modules deeper, read [DEEPENING.md](DEEPENING.md).
- To design an interface in several ways before you choose one, read [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
