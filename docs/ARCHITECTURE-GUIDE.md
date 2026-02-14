# Architecture Guide

The Harness is a model-agnostic infrastructure layer that sits between raw AI models and useful AI systems. This guide explains how the five layers work together, and how data flows through the system.

## The Five Layers

### Layer 1: Context (The Foundation)

Context is the persistent configuration that loads automatically every session. It follows a layered hierarchy, like CSS specificity: global defaults first, then project overrides, then task-specific skill context.

| Layer | Scope | Files |
|-------|-------|-------|
| Global | Every session | `CLAUDE.md`, `context.md`, `settings.json` |
| Project | Per-project | `.claude/CLAUDE.md`, `.harness.json`, `MEMORY.md` |
| Task | On-demand | `SKILL.md`, `Workflows/*.md`, `Tools/*.ts` |

More specific layers override more general ones. A project can override global coding standards. A skill can override project conventions for a specific operation.

Full specification: [specs/LayeredContext.md](../specs/LayeredContext.md)

### Layer 2: Hooks (The Nervous System)

Hooks provide event-driven automation at six lifecycle points. They receive JSON payloads via stdin and communicate via stdout and exit codes.

```
SessionStart → UserPromptSubmit → PreToolUse → SubagentStop → Stop → SessionEnd
```

Key design properties:
- **Fail-open**: A broken hook is logged and skipped, never crashes the session
- **Non-blocking**: Hooks have timeouts; slow hooks are killed
- **Composable**: Multiple hooks can fire on the same event
- **Observable**: All hook activity can be captured for audit

Full specification: [specs/HookLifecycle.md](../specs/HookLifecycle.md)

### Layer 3: Skills (The Capability System)

Skills are portable, self-contained units of domain expertise. Each skill is a directory containing a `SKILL.md` specification with YAML frontmatter, a workflow routing table, and execution procedures in `Workflows/`.

```
SkillName/
├── SKILL.md             # Specification with USE WHEN triggers
├── Workflows/           # Step-by-step procedures
│   └── WorkflowName.md
└── Tools/               # CLI utilities (optional)
    └── ToolName.ts
```

Skills self-activate via USE WHEN clauses in their frontmatter. When a user's message matches a trigger phrase, the skill engages and routes to the appropriate workflow.

Full specification: [specs/SkillSystem.md](../specs/SkillSystem.md)

### Layer 4: Memory (The Long-Term Brain)

Memory provides cross-session persistence so each conversation builds on the last. All memory is plain files in the filesystem.

```
MEMORY/
├── WORK/          # Session work directories with META.yaml
├── LEARNING/      # Extracted insights organized by topic
│   └── SIGNALS/   # Quality ratings (ratings.jsonl)
├── STATE/         # Current work state (current-work.json)
└── SECURITY/      # Append-only audit logs
```

Memory is populated by hooks: SessionStart reads state, Stop writes summaries, learning extraction hooks capture insights. Over time, memory compounds -- each session is smarter than the last.

Full specification: [specs/MemorySystem.md](../specs/MemorySystem.md)

### Layer 5: Identity (The Personality)

Identity makes AI behavior consistent across sessions, models, and contexts. It is expressed as structured configuration, not emergent model behavior.

| Component | File | Purpose |
|-----------|------|---------|
| Constitution | `constitution.md` | Core values, operating principles, permission to fail |
| Personality dials | YAML in constitution | Tunable traits (humor, precision, directness, etc.) |
| Context | `context.md` | Who you are, what you work on, how you prefer to communicate |

Personality calibration uses a 0-100 scale:

```yaml
personality:
  humor: 60
  precision: 95
  directness: 80
  playfulness: 75
```

## How Layers Interact

```
User sends message
  │
  ├─→ UserPromptSubmit hooks fire (logging, categorization)
  │
  ├─→ Skill routing matches against USE WHEN triggers
  │     └─→ Skill context loads (Layer 3 into Layer 1)
  │
  ├─→ AI processes with full context stack (Layers 1-5)
  │
  ├─→ AI invokes tools
  │     └─→ PreToolUse hooks fire (security, validation)
  │
  ├─→ AI generates response
  │     └─→ Stop hooks fire (summary, learning capture)
  │
  └─→ Memory updated (Layer 4 persists for next session)
```

## The Security Model

Security is implemented as defense in depth through the hook system:

**Layer 1: Path Protection**
The SecurityValidator hook maintains a deny-list of paths that must never be read or written (`~/.ssh/`, `~/.aws/`, `.env` files).

**Layer 2: Command Validation**
PreToolUse hooks inspect Bash commands before execution. Dangerous patterns (recursive deletion, force pushes, credential access) are blocked or require confirmation.

**Layer 3: Audit Trail**
All security-relevant events are logged to append-only JSONL files in `MEMORY/SECURITY/`. These logs exist outside the AI's modification scope.

**Layer 4: Fail-Open Degradation**
If a security hook crashes, the session continues but the event is logged. This prevents a security bug from becoming a denial-of-service against the user.

The security model follows Zero Trust principles: assume breach, validate every operation, maintain immutable logs, apply least-privilege access.

## File Layout Conventions

| Convention | Rule |
|------------|------|
| Skill names | TitleCase (`CodeReview`, not `code-review`) |
| Hook files | `Name.hook.ts` suffix |
| Workflow files | TitleCase in `Workflows/` directory |
| Memory files | Lowercase with hyphens (`current-work.json`) |
| Specs | TitleCase markdown in `specs/` |
| Config files | Lowercase (`settings.json`, `context.md`) |

## Operational Patterns

The framework ships with four operational patterns available to all skills:

| Pattern | Purpose |
|---------|---------|
| **BRIEF Protocol** | Pre-plan enrichment: Boundaries, Role, Intent, Examples, Format |
| **Circuit Breaker** | Auto-stop on 3+ same errors, scope creep, or assumption invalidation |
| **Ship Gate Checklist** | Pre-completion: simplest solution? reviewable? explainable? |
| **70-30 Human-AI Control** | AI drafts, human approves. Autonomy is earned, not assumed. |

For the founding principles behind these decisions, see [specs/Architecture.md](../specs/Architecture.md).
