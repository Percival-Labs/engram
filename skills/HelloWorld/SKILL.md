---
name: HelloWorld
description: Tutorial skill demonstrating the skill system. USE WHEN learning skills OR creating first skill OR testing skill activation. Shows the minimum viable skill structure.
---

# HelloWorld

The simplest possible skill. Use this as a reference when learning how skills work or when creating your own.

A skill needs three things:
1. A `SKILL.md` with YAML frontmatter (you are reading it)
2. A `Workflows/` directory with at least one workflow
3. A `Tools/` directory (can be empty)

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Greet the user | [Greet](Workflows/Greet.md) | Default. Produces a personalized greeting using names from settings.json |

## Examples

**Example 1: Basic activation**

> User: "Hello, who are you?"

Routes to: `Greet` -- reads principal.name and identity.name from settings.json, responds with a personalized greeting.

**Example 2: Testing the skill system**

> User: "I want to test that skills are working"

Routes to: `Greet` -- confirms the skill system is operational by producing a greeting that references configured names.
