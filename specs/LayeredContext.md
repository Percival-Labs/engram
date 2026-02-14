# Layered Context Specification

**The Harness Framework -- Hierarchical Configuration Loading**

---

## Overview

The Harness uses a layered context system to provide AI with persistent knowledge across sessions. Context is loaded hierarchically -- global settings first, then project-specific overrides, then task-specific skill context. This mirrors how CSS specificity works: more specific layers override more general ones.

Context is expressed as plain files (markdown, YAML, JSON) stored in the filesystem. No database. No cloud service. Just files that your AI tool reads at session start.

---

## The Three Layers

### Layer 1: Global Context (Always Loaded)

Global context loads on every session regardless of which project or task is active. It defines identity, preferences, and system-wide configuration.

| File | Purpose | Priority |
|------|---------|----------|
| `harness.md` | Skill registry, stack preferences, security rules, tool configuration | HIGH |
| `context.md` | Personal identity, goals, background, working style | HIGH |
| `settings.json` | Hook registry, environment variables, permissions | HIGH |

**Loading behavior:** These files are read at session start and their contents are injected as system-level context. The AI receives this information before any user interaction.

**Location:** Global context lives in your AI tool's configuration directory (e.g., `~/.harness/` or equivalent).

### Layer 2: Project Context (Per-Project)

Project context loads when the AI operates within a specific project directory. It provides project-specific conventions, architecture notes, and local overrides.

| File | Purpose | Priority |
|------|---------|----------|
| `.harness/config.md` | Project conventions, architecture decisions, local tool config | HIGH |
| `.harness.json` | Project manifest (name, phase, focus, description) | MEDIUM |
| `MEMORY.md` | Project-specific learnings and accumulated knowledge | MEDIUM |

**Loading behavior:** When your AI tool detects a project directory (via `.harness.json`, `.git`, or framework config), it loads these files in addition to global context. Project settings override global settings where they conflict.

**Location:** Project context lives in the project's root directory or its `.harness/` subdirectory.

### Layer 3: Task Context (On Demand via Skills)

Task context loads dynamically when a specific skill activates. It provides domain-specific knowledge, workflow procedures, and reference material that would waste context budget if loaded globally.

| Source | Purpose | Priority |
|--------|---------|----------|
| `SKILL.md` | Skill specification with routing and examples | MEDIUM |
| `Workflows/*.md` | Step-by-step procedures for specific tasks | LOW |
| `Tools/*.ts` | CLI tool documentation and usage | LOW |
| Reference files | Domain-specific knowledge bases | LOW |

**Loading behavior:** Task context is loaded lazily -- only when the skill activates in response to user intent. Once loaded, it remains available for the duration of the task. Multiple skills can be active simultaneously.

---

## Loading Pattern

Context loads in a deterministic sequence:

```
Session Start
  |
  +--> Load Layer 1 (Global)
  |      harness.md -> context.md -> settings.json
  |
  +--> Load Layer 2 (Project)
  |      .harness/config.md -> .harness.json -> MEMORY.md
  |
  +--> Session Ready (user can interact)
         |
         +--> User triggers skill
         |      |
         |      +--> Load Layer 3 (Task)
         |             SKILL.md -> relevant Workflow -> Tools
         |
         +--> AI responds with full context stack
```

### Precedence Rules

When the same setting appears at multiple layers:

1. **Layer 3 (Task)** overrides Layer 2 and Layer 1
2. **Layer 2 (Project)** overrides Layer 1
3. **Layer 1 (Global)** is the baseline default

This is intentional. A project can override global coding standards. A task can override project conventions for a specific operation.

---

## Context Budget

AI tools have finite context windows. The framework uses a priority system to manage context budget when the total available context exceeds model limits.

### Priority Levels

| Priority | Behavior | Examples |
|----------|----------|---------|
| **HIGH** | Always loaded, never trimmed | Global config, security rules, identity |
| **MEDIUM** | Loaded when relevant, trimmed under pressure | Project memory, skill specs, manifests |
| **LOW** | Loaded on demand, first to be trimmed | Workflow details, reference docs, tool usage |

### Budget Management Guidelines

- **HIGH priority** content should total under 5,000 tokens combined
- **MEDIUM priority** content should total under 10,000 tokens combined
- **LOW priority** content is loaded only when actively needed
- If total context exceeds the model's window, trim LOW first, then MEDIUM
- HIGH priority content is never trimmed -- if it does not fit, the configuration is too large

### Keeping Context Lean

| Practice | Why |
|----------|-----|
| Use references instead of inlining | Point to files rather than embedding their full content |
| Summarize project memory regularly | Condense old learnings into compact summaries |
| Archive completed work | Move finished session data to archive, keep only active state |
| Separate reference from instruction | Instructions are HIGH priority; reference material is LOW |

---

## Cross-Session Continuity

The context system enables continuity across sessions through the `MEMORY/` directory structure (see [MemorySystem.md](./MemorySystem.md) for full specification).

### How Continuity Works

1. **Session N** produces work, learnings, and state changes.
2. **Stop hooks** capture session summary, extract learnings, update state files.
3. **Session N+1** starts, and `SessionStart` hooks load the updated state.
4. The AI begins Session N+1 with full knowledge of what Session N accomplished.

### Key Continuity Files

| File | Updated By | Read By | Purpose |
|------|-----------|---------|---------|
| `MEMORY.md` | Stop hooks | SessionStart hooks | Project-level accumulated knowledge |
| `STATE/current-work.json` | Work tracking hooks | SessionStart hooks | What was in progress when last session ended |
| `LEARNING/` | Learning extraction hooks | On-demand skill queries | Indexed insights from past work |

### Continuity Best Practices

- Write MEMORY.md entries as facts, not narratives ("API uses JWT tokens" not "Today I learned that...")
- Keep current-work.json focused on actionable state (what is in progress, what is blocked)
- Prune MEMORY.md when it exceeds 200 lines -- summarize and archive
- Never store secrets or credentials in context files

---

## Configuration Examples

### Minimal Global Setup

```
~/.harness/
├── harness.md         # "You are a software engineer. Use TypeScript."
├── context.md         # "I work on web applications using React and Node."
└── settings.json      # { "hooks": {} }
```

### Project-Level Override

```
my-project/
├── .harness/
│   └── config.md      # "This project uses PostgreSQL and Drizzle ORM."
├── .harness.json      # { "name": "MyProject", "phase": "development" }
└── MEMORY.md          # "Database migrations use drizzle-kit."
```

### Full Stack with Skills

```
~/.harness/
├── harness.md
├── context.md
├── settings.json
├── skills/
│   ├── Research/
│   │   └── SKILL.md
│   └── CodeReview/
│       └── SKILL.md
└── MEMORY/
    ├── WORK/
    ├── LEARNING/
    └── STATE/
```
