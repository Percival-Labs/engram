# Getting Started

This guide walks you through installing The Harness and configuring your first AI session.

## Prerequisites

- **Bun** (v1.0 or later) -- [Install Bun](https://bun.sh)
- **Claude Code** (or another AI coding tool that reads `~/.claude/` configuration)
- **A terminal** -- The Harness is CLI-first

Verify your prerequisites:

```bash
bun --version   # Should print 1.x or later
```

## Installation

```bash
bun add -g the-harness
```

This installs the `pai` command globally.

## Running `pai init`

```bash
pai init
```

The init command walks you through an interactive setup. Here is what each question means:

| Prompt | What It Means |
|--------|---------------|
| **AI Name** | The name your AI will use for itself (e.g., "Atlas", "Sage"). This appears in the generated config files. |
| **Your Name** | Your name. The AI uses this to personalize its responses. |
| **Personality preset** | Choose a starting personality (balanced, precise, creative) or customize individual traits later. |
| **Install starter skills?** | Whether to copy the 4 included skills (Research, DoWork, Reflect, HelloWorld) into your config. Recommended for first-time setup. |
| **Install starter hooks?** | Whether to install the 3 lifecycle hooks (SecurityValidator, LoadContext, SessionSummary). Recommended. |

After answering, `pai init` creates the following structure in `~/.claude/`:

```
~/.claude/
├── CLAUDE.md              # AI identity and skill registry
├── context.md             # Your personal context
├── constitution.md        # Personality calibration
├── settings.json          # Hook configuration
├── skills/                # Starter skills (if selected)
│   ├── Research/
│   ├── DoWork/
│   ├── Reflect/
│   └── HelloWorld/
├── hooks/                 # Lifecycle hooks (if selected)
│   ├── LoadContext.hook.ts
│   ├── SecurityValidator.hook.ts
│   └── SessionSummary.hook.ts
└── MEMORY/                # Memory directories
    ├── WORK/
    ├── LEARNING/
    ├── STATE/
    └── SECURITY/
```

## Verifying Installation

After init completes, verify the setup:

```bash
# Check that core files exist
ls ~/.claude/CLAUDE.md ~/.claude/context.md ~/.claude/settings.json

# List installed skills
ls ~/.claude/skills/

# List installed hooks
ls ~/.claude/hooks/
```

You should see all the files and directories listed above.

## Your First Session

1. Open your AI coding tool (e.g., Claude Code) in any project directory.
2. The tool automatically reads `~/.claude/CLAUDE.md` and loads your configuration.
3. Your AI now has a name, personality, skills, and security hooks active.

Try these to see the system in action:

```
"Research the current state of WebAssembly adoption"
→ Triggers the Research skill's DeepDive workflow

"What are you working on?"
→ The AI reads its context and memory to respond

"Create a task to refactor the auth module"
→ Triggers the DoWork skill's Capture workflow
```

## Next Steps

- **Customize your context** -- Edit `~/.claude/context.md` with your projects, preferences, and working style
- **Tune personality** -- Adjust the YAML dials in `~/.claude/constitution.md`
- **Create a custom skill** -- See [Creating Skills](CREATING-SKILLS.md)
- **Write a custom hook** -- See [Writing Hooks](WRITING-HOOKS.md)

## Troubleshooting

**`pai: command not found`**
Ensure Bun's global bin directory is in your PATH. Run `bun pm bin -g` to find the directory, then add it to your shell profile.

**`pai init` says files already exist**
The init command runs in augment mode by default -- it will not overwrite existing files. To start fresh, remove the existing `~/.claude/` directory first, or use `pai init --force`.

**AI does not seem to use my skills**
Run `pai skill index` to regenerate the skill index. The AI reads the index to discover available skills.

**Hooks are not firing**
Check that your hooks are registered in `~/.claude/settings.json` under the `hooks` key, and that the hook files are executable (`chmod +x`).
