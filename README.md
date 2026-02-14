# Engram

**The AI Harness for Everyone** -- open-source personal AI infrastructure that turns any model into *your* AI.

Engram is the stable layer between a raw AI model and a useful AI system. It provides the structure -- skills, hooks, memory, security, personality -- so you can swap models without losing your setup. When a new model releases, your skills still work. Your memory persists. Your identity carries over.

## Install

```bash
npm install -g engram-harness
```

Requires Node.js 20+.

## Commands

### `engram init`

Scaffolds your personal AI infrastructure at `~/.claude/`. Creates identity files, starter skills, lifecycle hooks, memory directories, and a security validator -- everything needed to turn Claude Code into a personalized AI system.

```bash
engram init
```

### `engram bundle`

Generates a portable setup package for platforms that don't support CLI (Claude.ai, Claude Desktop, ChatGPT). Downloads as a zip with instructions, personality config, skills, and memory templates.

```bash
engram bundle --for "YourName"
```

### `engram serve`

Starts an MCP (Model Context Protocol) server that exposes your skills and memory as tools any MCP-compatible client can use.

```bash
engram serve
```

### `engram skill`

Manages your skill library -- create new skills from templates, rebuild the skill index, or list what's installed.

```bash
engram skill create MyNewSkill
engram skill index
engram skill list
```

## Architecture

Engram organizes AI infrastructure into five composable layers:

```
Layer 5: Agent Personalities    -- Who your AI is
Layer 4: Skills & Workflows     -- What your AI can do
Layer 3: Hooks & Events         -- When things happen
Layer 2: Memory & History       -- What your AI remembers
Layer 1: Security & Validation  -- What your AI guards against
             |
           MODEL (pluggable -- Claude, GPT, Gemini, local)
```

Each layer is independent. Use all five or start with just one.

## What You Get

After `engram init`, your `~/.claude/` directory contains:

| File / Directory | Purpose |
|------------------|---------|
| `CLAUDE.md` | AI identity, skill registry, global config |
| `context.md` | Your personal context (who you are, what you work on) |
| `constitution.md` | Personality calibration (tunable YAML dials) |
| `settings.json` | Runtime config with hook wiring |
| `skills/` | 4 starter skills (Research, DoWork, Reflect, HelloWorld) |
| `hooks/` | 3 lifecycle hooks (security, context loading, session summary) |
| `MEMORY/` | Structured memory directories |

Everything is plain files. Markdown, YAML, JSON. No database. No cloud service. Human-readable, git-friendly, portable.

## Web Bundle Generator

Don't use CLI? Visit the [Engram website](site/index.html) to generate a setup package through your browser. Fill in your name, tune personality sliders, and download a zip you can upload to Claude Projects or paste into ChatGPT custom instructions.

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING-STARTED.md) | Installation, setup, first session |
| [Creating Skills](docs/CREATING-SKILLS.md) | Build and register custom skills |
| [Writing Hooks](docs/WRITING-HOOKS.md) | Event-driven lifecycle hooks |
| [Architecture Guide](docs/ARCHITECTURE-GUIDE.md) | The five-layer system in detail |
| [Examples](docs/EXAMPLES.md) | Skills, hooks, and configuration examples |
| [FAQ](docs/FAQ.md) | Common questions |

## Contributing

Contributions welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Read the relevant spec in `specs/` before making changes
4. Follow existing conventions (TitleCase for skills, TypeScript for hooks)
5. Submit a pull request with a clear description

For bugs and feature requests, open an issue on GitHub.

## License

MIT -- see [LICENSE](LICENSE) for details.
