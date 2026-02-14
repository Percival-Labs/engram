# FAQ

## Does this only work with Claude Code?

The Harness was designed for Claude Code, and the hook system (lifecycle events, settings.json configuration) is specific to Claude Code's architecture. However, the core patterns -- skills as markdown specs, layered context, structured memory, personality calibration -- are model-agnostic and tool-agnostic. You can adapt the skill format and memory structure to work with any AI tool that reads configuration files.

## Will this overwrite my existing settings?

No. The `pai init` command runs in augment mode by default. It detects existing files and will not overwrite them. If you want a clean start, use `pai init --force`. You can also selectively install components (skills only, hooks only) without replacing your existing configuration.

## How many skills can I have?

There is no hard limit. Skills are indexed in a `skill-index.json` file that the AI reads for fast discovery. Systems with over 100 skills have been tested and work well. The key constraint is context budget -- only active skills consume context window tokens. Inactive skills sit on disk until their USE WHEN triggers match.

## Can I share skills with others?

Yes. A skill is a self-contained directory (SKILL.md, Workflows/, Tools/). Copy the directory into another user's `~/.claude/skills/` folder, run `pai skill index`, and it works. No special packaging or registry required. Skills are plain markdown and YAML -- they are portable by design.

## What if a hook crashes?

The system continues. Hooks follow a fail-open design: if a hook exits with an unexpected error code (anything other than 0 or 2), it is logged as a warning and skipped. The AI session proceeds normally. Only exit code 2 (hard block) prevents an operation. This is intentional -- a broken hook should degrade functionality, not halt the system.

## How do I uninstall The Harness?

1. Remove hook registrations from `~/.claude/settings.json` (delete the `hooks` entries)
2. Delete the framework files you no longer want (`skills/`, `hooks/`, `MEMORY/`)
3. Optionally, uninstall the CLI: `bun remove -g the-harness`

Your `CLAUDE.md`, `context.md`, and `constitution.md` files are yours to keep or remove as you choose. They work independently of the framework.

## Can I use this with other AI tools besides Claude Code?

The patterns are universal. Markdown skill specs, YAML personality calibration, and filesystem-based memory work with any AI tool that can read files. The hook system (lifecycle events, settings.json wiring) is specific to Claude Code. If your AI tool supports similar lifecycle events, you can adapt the hook scripts. If it does not, you still benefit from the skill system, context layers, and memory structure.

## How is this different from a prompt library?

A prompt library gives you text to paste into a chat window. When the model changes, the prompts may stop working. The Harness gives you infrastructure -- skills that define capabilities as specifications, hooks that automate behavior, memory that persists across sessions, and identity that stays consistent. The model is a swappable runtime. The harness is the stable layer that survives model upgrades.

## Do I need to know TypeScript to use this?

No. Skills and workflows are written in plain markdown. Personality and context are plain text files. You only need TypeScript if you want to write custom hooks or CLI tools. The starter hooks included with the framework cover the most common use cases (security validation, context loading, session summary) without modification.

## How do I update The Harness?

```bash
bun update -g the-harness
```

Framework updates ship new starter skills, hook templates, and CLI improvements. Your personal configuration (CLAUDE.md, context.md, constitution.md, custom skills, custom hooks) is never touched by updates. The framework and your configuration are separate concerns by design.
