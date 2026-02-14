# Examples

Concrete examples of skills, hooks, and configurations you can build with The Harness.

## 1. Adding a DailyBrief Skill

A skill that summarizes your calendar, weather, and top priorities into a morning briefing.

### Create the skill

```bash
pai skill create DailyBrief
```

### Edit the SKILL.md

```yaml
---
name: DailyBrief
description: Generates a morning briefing with calendar, weather, and priorities. USE WHEN user asks for daily brief OR morning summary OR "what's on today" OR start of day overview.
---
```

```markdown
# DailyBrief

Produces a structured morning briefing combining schedule, weather, and active tasks.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **Morning** | "daily brief" OR "morning summary" OR "what's on today" | `Workflows/Morning.md` |

## Examples

**Example 1: Standard morning brief**
```
User: "Give me my daily brief"
-> Invokes Morning workflow
-> Reads calendar data, checks weather API, reviews STATE/current-work.json
-> Returns structured briefing with schedule, weather, and top 3 priorities
```

**Example 2: Contextual start of day**
```
User: "What's on today?"
-> Invokes Morning workflow
-> Same as above, with emphasis on schedule conflicts and deadlines
```
```

### Create the workflow

Write `~/.claude/skills/DailyBrief/Workflows/Morning.md`:

```markdown
# Morning

Generates a morning briefing.

## Steps

1. **Check calendar** -- Read today's events from the calendar source.
2. **Check weather** -- Fetch current conditions and forecast for the user's location.
3. **Review active work** -- Read MEMORY/STATE/current-work.json for in-progress tasks.
4. **Identify priorities** -- Select the top 3 items that need attention today.
5. **Format briefing** -- Structure output as a scannable morning brief.

## Output Format

**Date**: [Today's date]

**Weather**: [Conditions, high/low]

**Schedule**:
- [Time] - [Event]
- [Time] - [Event]

**Priorities**:
1. [Most important task]
2. [Second priority]
3. [Third priority]

**Blockers**: [Anything that needs resolution]
```

### Register and index

```bash
pai skill index
```

---

## 2. Writing a PreToolUse Hook That Blocks npm publish

A security hook that prevents accidental package publishing without a dry run first.

### Create the hook file

Save as `~/.claude/hooks/PublishGuard.hook.ts`:

```typescript
#!/usr/bin/env bun
// Hook: PublishGuard
// Event: PreToolUse
// Description: Blocks npm/bun publish unless --dry-run is specified

import { readFileSync } from "fs";

const payload = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
const { tool_name, tool_input } = payload;

if (tool_name === "Bash") {
  const cmd = tool_input.command || "";

  // Block npm publish without --dry-run
  if (cmd.includes("npm publish") && !cmd.includes("--dry-run")) {
    console.log(JSON.stringify({
      decision: "block",
      message: "npm publish blocked. Run with --dry-run first to verify package contents.",
    }));
    process.exit(2);
  }

  // Block bun publish without --dry-run
  if (cmd.includes("bun publish") && !cmd.includes("--dry-run")) {
    console.log(JSON.stringify({
      decision: "block",
      message: "bun publish blocked. Run with --dry-run first to verify package contents.",
    }));
    process.exit(2);
  }
}

process.exit(0);
```

### Make it executable

```bash
chmod +x ~/.claude/hooks/PublishGuard.hook.ts
```

### Register in settings.json

Add to the `PreToolUse` array in `~/.claude/settings.json`:

```json
{
  "path": "hooks/PublishGuard.hook.ts",
  "timeout": 3000,
  "matcher": {
    "tool_name": "Bash"
  }
}
```

Now any attempt to run `npm publish` or `bun publish` without `--dry-run` will be blocked with an explanation.

---

## 3. Customizing Personality for Different Use Cases

The constitution file lets you tune AI personality for different working styles.

### Coding-focused AI

For a precise, no-nonsense engineering assistant:

```yaml
personality:
  humor: 20
  excitement: 30
  curiosity: 70
  precision: 95
  professionalism: 85
  directness: 90
  playfulness: 15
```

In `constitution.md`, add voice characteristics:

```markdown
## Voice Characteristics

- Terse and precise. No filler words.
- Lead with the answer, then explain if needed.
- Flag risks and edge cases without being asked.
- Prefer code examples over prose explanations.
```

### Research-focused AI

For an exploratory, thorough research assistant:

```yaml
personality:
  humor: 50
  excitement: 70
  curiosity: 95
  precision: 80
  professionalism: 60
  directness: 65
  playfulness: 55
```

In `constitution.md`, adjust the voice:

```markdown
## Voice Characteristics

- Thorough and methodical. Consider multiple angles.
- Surface connections between topics that are not immediately obvious.
- Always cite sources and distinguish fact from interpretation.
- Ask clarifying questions when the research scope is ambiguous.
```

---

## 4. Setting Up Project-Level Context

Override global settings for a specific repository by adding project-level configuration.

### Create project config

In your project root, create `.claude/CLAUDE.md`:

```markdown
# MyProject Configuration

## Architecture

- This is a Next.js 15 application with App Router
- Database: PostgreSQL with Drizzle ORM
- Auth: JWT with refresh token rotation
- Testing: Vitest for unit, Playwright for e2e

## Conventions

- All API routes go in `src/app/api/`
- Database migrations use `drizzle-kit generate` then `drizzle-kit push`
- Environment variables are validated in `src/env.ts`
- Never commit `.env` files

## Current Focus

Working on the authentication module. All auth-related code is in `src/lib/auth/`.
```

### Add a project manifest

Create `.harness.json` in the project root:

```json
{
  "name": "MyProject",
  "phase": "development",
  "focus": "Authentication module",
  "description": "Next.js application with JWT auth"
}
```

### Add project memory

Create `MEMORY.md` in the project root:

```markdown
# MyProject Memory

## Database
- PostgreSQL JSONB indexes require GIN, not B-tree
- Connection pooling set to max 20 in production

## Auth
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Token refresh endpoint is rate-limited to 10/minute
```

When you open your AI tool in this project directory, it loads this context on top of your global configuration. The AI knows the project's architecture, conventions, and accumulated learnings without you repeating them every session.
