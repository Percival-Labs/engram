# Architecture

**The Harness Framework -- Founding Principles & System Overview**

---

## System Overview

The Harness is a model-agnostic infrastructure layer that sits between raw AI models and useful AI systems. It provides five core subsystems that survive model upgrades, platform changes, and workflow evolution.

### Core Subsystems

| Subsystem | Purpose | Specification |
|-----------|---------|---------------|
| **Skills** | Portable, self-contained units of domain expertise | [SkillSystem.md](./SkillSystem.md) |
| **Hooks** | Event-driven lifecycle for observability, security, and automation | [HookLifecycle.md](./HookLifecycle.md) |
| **Memory** | Cross-session persistence for compounding intelligence | [MemorySystem.md](./MemorySystem.md) |
| **Context** | Layered configuration loading for identity, projects, and tasks | [LayeredContext.md](./LayeredContext.md) |
| **CLI** | Command-line interface for all framework operations | `harness init`, `harness skill create`, `harness skill index` |

### The Five Layers

```
+---------------------------------------------+
|  Layer 5: IDENTITY                          |
|  Who the AI is, how it behaves              |
|  (constitution, personality, voice)         |
+---------------------------------------------+
|  Layer 4: MEMORY                            |
|  What the AI remembers across sessions      |
|  (project memory, learnings, journals)      |
+---------------------------------------------+
|  Layer 3: SKILLS                            |
|  What the AI can do                         |
|  (skill specs, workflows, tools, routing)   |
+---------------------------------------------+
|  Layer 2: HOOKS                             |
|  How the AI's behavior is observed/modified |
|  (lifecycle events, security, logging)      |
+---------------------------------------------+
|  Layer 1: CONTEXT                           |
|  What the AI knows about you and your work  |
|  (settings, env, project configs)           |
+---------------------------------------------+
         MODEL (pluggable -- any provider)
```

---

## The 14 Founding Principles

### 1. Clear Thinking + Prompting is King

The quality of your AI system is bounded by the clarity of your thinking. No amount of tooling compensates for fuzzy requirements or ambiguous intent. Before writing a prompt, write down what you actually want. Before building a skill, define what success looks like. The framework enforces this through structured specifications, not free-form instructions.

### 2. Scaffolding > Model

The system architecture matters more than the underlying AI model. A well-structured scaffolding layer with clear skills, hooks, and context will outperform a raw frontier model every time. When a new model releases, a well-scaffolded system absorbs it as a firmware update. A poorly-scaffolded system starts over.

### 3. As Deterministic as Possible

Same input should produce the same output. Behavior should be defined by code, configuration, and specifications -- not by prompt engineering tricks or model-specific quirks. Where non-determinism is unavoidable (natural language generation), constrain it with structured outputs, validation, and evaluation criteria.

### 4. Code Before Prompts

Write code to solve problems. Use prompts to orchestrate code. If something can be a function, make it a function. If something can be a CLI tool, make it a CLI tool. Prompts should coordinate capabilities, not implement them. Code is testable, versionable, and debuggable. Prompts are none of these.

### 5. Spec / Test / Evals First

Define expected behavior before writing implementation. Write the skill specification before the workflow. Write the test before the code. Write the evaluation criteria before the prompt. This principle applies at every level: skill design, hook implementation, workflow authoring, and tool development.

### 6. UNIX Philosophy (Modular Tooling)

Do one thing well. Compose tools through standard interfaces. Each skill handles one domain. Each hook handles one concern. Each tool performs one operation. Composition happens through well-defined contracts (markdown specs, JSON payloads, stdin/stdout), not through monolithic frameworks.

### 7. ENG / SRE Principles ++

Apply production engineering and site reliability principles to AI systems. This means: observability (hooks provide event streams), reliability (circuit breakers prevent runaway failures), graceful degradation (hooks fail open by default), audit trails (event capture for compliance), and incident response patterns (security validators as AI firewalls).

### 8. CLI as Interface

Every operation in the framework should be accessible via command line. CLI is the universal interface -- scriptable, composable, automatable, and testable. GUI and web interfaces are optional layers built on top of CLI capabilities, never the other way around.

### 9. Goal -> Code -> CLI -> Prompts -> Agents

This is the proper development pipeline for AI capabilities:

1. **Goal** -- Define what you want to accomplish
2. **Code** -- Write deterministic logic to solve the problem
3. **CLI** -- Expose that logic through a command-line interface
4. **Prompts** -- Write skill specifications that invoke the CLI tools
5. **Agents** -- Compose skills into autonomous agent workflows

Never skip steps. Never start with agents and work backward.

### 10. Meta / Self-Update System

The framework should be capable of improving itself. Skills can generate new skills. Hooks can modify hook configurations. Memory captures learnings that inform future behavior. The system is reflexive -- it observes its own operation and feeds insights back into its configuration.

### 11. Custom Skill Management

Skills are the fundamental organizational unit for all AI expertise. Every capability, workflow, and domain specialization is expressed as a skill. Skills are portable (plain markdown), versionable (git-friendly), shareable (copy a folder), and composable (skills invoke skills). The skill system is the heart of the framework.

### 12. Custom History System

Automatic capture of valuable work compounds AI intelligence over time. Session journals, extracted learnings, project memories, and quality signals all persist in the filesystem. Each session builds on the knowledge of every previous session. Memory is not optional -- it is what transforms a stateless model into a persistent collaborator.

### 13. Custom Agent Personalities / Voices

AI identity is declarative, not emergent. Personality traits, communication style, values, and behavioral constraints are expressed as structured configuration (YAML calibration dials, markdown constitutions). This makes identity portable across models, tunable by users, and consistent across sessions.

### 14. Science as Cognitive Loop

Treat AI system development as an empirical discipline. Hypothesize (write specs), experiment (implement), measure (evaluate), and learn (capture in memory). Sentiment signals and quality ratings feed back into skill refinement. The framework does not assume correctness -- it measures it.

---

## Operational Patterns

These patterns ship with the framework and are available to all skills and workflows.

### BRIEF Protocol

Pre-plan enrichment for non-trivial tasks:

| Step | Question |
|------|----------|
| **B**oundaries | What is out of scope? |
| **R**ole | What persona should the AI adopt? |
| **I**ntent | What is the actual goal? |
| **E**xamples | What does good output look like? |
| **F**ormat | What structure should the output follow? |

### Circuit Breaker

Automatic stop conditions to prevent runaway failures:

- 3+ identical errors in sequence
- Scope creep detected (work diverging from stated goal)
- Assumption invalidation (a core premise proved false)

### Ship Gate Checklist

Pre-completion validation before delivering any output:

- Is this the simplest solution that works?
- Could a colleague review this in under 10 minutes?
- Can you explain every decision you made?

### 70-30 Human-AI Control

Default to AI-drafts, human-approves. The AI proposes, the human disposes. Autonomous execution is earned through demonstrated reliability, not assumed by default.
