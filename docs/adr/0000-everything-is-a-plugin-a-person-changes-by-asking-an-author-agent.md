# 0. Everything is a plugin, and a person changes any of it by asking an author agent

- Status: accepted
- Date: 2026-09-26

## Context

dsh keeps nothing privileged: every part of it is a plugin, so each is replaceable from configuration, and there is no core to patch (dsh's architecture, at dsh-v0.1.7-rc.2). pi's terminal is open the same way to its extensions: one may draw a tool or a session entry its own way, replace the header, the footer or the editor, and open a screen of its own (pi's TUI guide, at v0.87.1).

binnacle is drawn for a person who is not expected to write its code. What they want differs from person to person: how a tool's card reads, whether signing in is a dialog or a page, what settings look like and which are a key away. And a preset can log kinds nobody writing binnacle has seen ([ADR 3](0003-dsh-is-reached-through-named-seams-each-held-by-a-gate.md)). A person gets what they want by asking the agent in front of them, which writes a plugin: an author. So what an author agent can find and reach is exactly what a person can change. Anything it cannot reach is a choice binnacle made for them.

An agent learns what it can do from what its session hands it. A plugin can hand it a skill (dsh's `SkillRegistration`, at dsh-v0.1.7-rc.2). An extension point no skill describes is one no agent uses.

## Decision

**Every part of binnacle is a plugin that a person can change, replace or remove by asking an author agent, through the same registrations the built-in surface is made of.** This is binnacle's first commitment, and every other record serves it.

- **Everything.** This covers what the transcript draws: every tool's card, or one tool's. It covers the composer and the rest of the chrome, and the dialogs and screens a feature opens, signing in and settings among them. It covers the keys and the theme. Nothing binnacle draws or answers is beyond an author's reach; what cannot be reached yet is a gap to close, never a boundary.
- **At the grain a person asks.** An author changes one tool's card without redrawing every other, and builds on what binnacle draws rather than copying it.
- **binnacle provides the building blocks, and says what they are.** It provides:
  - the blocks a view draws with, from text in a tone to a card around what it holds;
  - the placements that put what it draws on the screen;
  - the grants that perform its effects;
  - a skill that tells an author agent, in the session, what exists and how to use it.

  When a person asks for something the blocks cannot draw, the defect is binnacle's. The answer is a new block, never a private door and never a refusal.
- **Strictness is spent on the contract, not on the reach.** A registration is disposed with its plugin. An author's code is fenced, and its failure is drawn. What is drawn follows from what was given. One table gives every gesture its meaning. When a rule stops an author from drawing or replacing what a person asked for, the rule gives way, through a new record that revises it.

## Alternatives considered

**A fixed surface that a person tunes with settings.** codex's terminal takes this road: animations, tooltips, notifications and the like are switches in its configuration (its `Tui` configuration, at commit d7b07d4). It is simpler, and every combination can be tested. It lost because each switch is a guess at what a person will want, and a kind a preset logs tomorrow has no switch.

**Hand an author pi-tui's components, as pi hands them to its extensions.** It gives the most reach with nothing to design. It lost ([ADR 2](0002-five-layers-and-the-registrations-an-author-shares.md)) because a component an agent writes can break widths, focus or the keyboard in ways no fence catches, and a pi-tui release can break all such components at once. The building blocks give the same reach, and binnacle handles those failures once, for every author.

**Change binnacle's source.** An agent can edit a fork or patch the bundle, and everything is within reach. It lost because the person has to carry the change: it cannot be taken back while binnacle runs, and it collides with every upgrade.

**Make the built-in surface first-class, and give authors hooks around it.** This is the usual shape of an extension API, and it lets the built-in surface move faster. It lost because the author's version is always second-class, and each shortcut the built-in surface takes is a place where the two drift apart ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)).

## Consequences

- The author API is the product. Every surface binnacle ships reaches the screen through doors an author has, so the API grows with every feature, and taking anything out of it breaks what people have made.
- The building blocks must keep up with what people ask for. A vocabulary too small to draw a request is a defect against binnacle.
- binnacle ships a skill that describes the author API. Like any fact restated from code, it is held to the source, so an agent is never taught a door that is not there.
- For everything that lives in a plugin, `check:layers` holds the promise of the same registrations ([ADR 5](0005-a-built-in-feature-is-a-plugin-that-holds-only-what-an-author-holds.md)). Anything the host builds itself is where a private door can hide.
- Where an earlier record is stricter than this one, a new record revises it.
