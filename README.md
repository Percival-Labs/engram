# Engram

**Personal AI infrastructure — the stable layer between raw AI model and useful AI system.**

## The Rack Analogy

A server rack in a data center does not compute anything. It provides power, cooling, networking, and mounting. You can swap servers without rebuilding the data center. The rack is the stable infrastructure that makes everything else work.

Engram is a rack for AI. It does not care which model you use. It provides the structure -- skills, hooks, memory, security -- that turns a raw AI model into a reliable personal AI system.

When a new model releases, an Engram-powered system absorbs it as a firmware update. Your skills do not change. Your hooks still fire. Your memory persists. Your identity carries over. The model is swappable. The infrastructure is permanent.

## Architecture

Engram organizes AI infrastructure into five layers:

```
┌─────────────────────────────────────┐
│  Layer 5: Agent Personalities       │  ← Who your AI is
├─────────────────────────────────────┤
│  Layer 4: Skills & Workflows        │  ← What your AI can do
├─────────────────────────────────────┤
│  Layer 3: Hooks & Events            │  ← When things happen
├─────────────────────────────────────┤
│  Layer 2: Memory & History          │  ← What your AI remembers
├─────────────────────────────────────┤
│  Layer 1: Security & Validation     │  ← What your AI guards against
└─────────────────────────────────────┘
              ↕ MODEL
    (pluggable — Claude, GPT, Gemini, local)
```

Each layer is independent and composable. You can use all five or start with just one.

## Quick Start

### For Claude Code Users

```bash
# Install
npx engram-harness init

# Create your first skill
engram skill create MyFirstSkill

# Update the skill index
engram skill index
```

### For Everyone Else (Claude Desktop, ChatGPT, Claude.ai)

```bash
# Generate a portable bundle
npx engram-harness bundle --for "YourName"
```

This creates a folder you can upload to Claude Projects or paste into ChatGPT custom instructions. No CLI required after setup.

## What You Get

After running `engram init`, your `~/.claude/` directory contains:

| File / Directory | Purpose |
|------------------|---------|
| `CLAUDE.md` | AI identity, skill registry, and global configuration |
| `context.md` | Your personal context (who you are, what you work on) |
| `constitution.md` | Personality calibration (tunable YAML dials) |
| `settings.json` | Runtime config with hook wiring |
| `skills/` | 4 starter skills (Research, DoWork, Reflect, HelloWorld) |
| `hooks/` | 3 lifecycle hooks (security, context loading, session summary) |
| `MEMORY/` | Structured memory directories (work, learnings, state, security) |

Everything is plain files. Markdown, YAML, JSON. No database. No cloud service. Human-readable, git-friendly, and portable.

## The 14 Founding Principles

1. **Clear Thinking + Prompting is King** -- Clarity of intent bounds system quality
2. **Scaffolding > Model** -- Architecture outlasts any single model release
3. **As Deterministic as Possible** -- Same input, same output. Code over vibes.
4. **Code Before Prompts** -- Write code to solve problems, prompts to orchestrate code
5. **Spec / Test / Evals First** -- Define expected behavior before implementation
6. **UNIX Philosophy** -- Do one thing well. Compose through standard interfaces.
7. **ENG / SRE Principles** -- Observability, reliability, graceful degradation
8. **CLI as Interface** -- Every operation is scriptable and automatable
9. **Goal -> Code -> CLI -> Prompts -> Agents** -- The proper development pipeline
10. **Meta / Self-Update System** -- The system can improve itself
11. **Custom Skill Management** -- Skills are the organizational unit for all expertise
12. **Custom History System** -- Memory compounds intelligence over time
13. **Custom Agent Personalities** -- Identity is declarative, not emergent
14. **Science as Cognitive Loop** -- Hypothesize, experiment, measure, learn

Full details in [specs/Architecture.md](specs/Architecture.md).

## Project Structure

```
engram/
├── README.md
├── LICENSE                          # MIT
├── package.json
├── src/                             # CLI source
│   ├── cli.ts                       # Entry point (engram command)
│   ├── commands/                    # CLI command implementations
│   └── lib/                         # Shared utilities
├── templates/                       # Scaffolding templates
├── hooks/                           # Starter hooks
│   ├── GreetingHook.hook.ts
│   ├── LoadContext.hook.ts
│   ├── SecurityValidator.hook.ts
│   ├── SessionSummary.hook.ts
│   └── lib/                         # Hook utilities
├── skills/                          # Starter skills
│   ├── Research/
│   ├── DoWork/
│   ├── Reflect/
│   └── HelloWorld/
├── specs/                           # Framework specifications
└── docs/                            # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING-STARTED.md) | Installation, setup, and first session |
| [Creating Skills](docs/CREATING-SKILLS.md) | How to build and register custom skills |
| [Writing Hooks](docs/WRITING-HOOKS.md) | Event-driven lifecycle hooks |
| [Architecture Guide](docs/ARCHITECTURE-GUIDE.md) | The five-layer system in detail |
| [Examples](docs/EXAMPLES.md) | Concrete examples of skills, hooks, and configurations |
| [FAQ](docs/FAQ.md) | Common questions and answers |

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Read the relevant spec in `specs/` before making changes
4. Follow existing conventions (TitleCase for skills, TypeScript for hooks)
5. Submit a pull request with a clear description of what you changed and why

For bug reports and feature requests, open an issue on GitHub.

## License

MIT -- see [LICENSE](LICENSE) for details.
