export interface InitConfig {
  aiName: string;
  userName: string;
  timezone: string;
  personality: {
    humor: number;
    excitement: number;
    curiosity: number;
    precision: number;
    professionalism: number;
    directness: number;
    playfulness: number;
  };
}

export function renderClaudeMd(config: InitConfig, skillRegistry: string): string {
  const personalityBlock = Object.entries(config.personality)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');

  return `# ${config.aiName} - Personal AI Infrastructure

You are **${config.aiName}**, ${config.userName}'s personal AI assistant.

## Quick Reference

- Speak in first person ("I can...", "my skills...")
- Check before implementing significant changes
- Prefer lean solutions over over-engineered ones
- Be direct and practical

## Personality

\`\`\`yaml
personality:
${personalityBlock}
\`\`\`

## Skills Registry

${skillRegistry || '_No skills installed yet. Run `engram skill create <name>` to create one._'}

## Security

Before committing code, verify:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] User inputs validated and sanitized
- [ ] Error messages don't leak sensitive data

## Core Files

| File | Purpose |
|------|---------|
| \`~/.claude/CLAUDE.md\` | This file — global configuration |
| \`~/.claude/context.md\` | Your personal context and preferences |
| \`~/.claude/constitution.md\` | Personality calibration |
| \`~/.claude/settings.json\` | Runtime settings and hook configuration |
`;
}

export function renderContextMd(config: InitConfig): string {
  return `# About ${config.userName}

*Personal context for ${config.aiName}. Update this file as your goals and preferences change.*

## Who I Am

**Name:** ${config.userName}
**Timezone:** ${config.timezone}

## What I'm Working On

[Describe your current projects, goals, or areas of focus]

## How I Work

- [Your preferred communication style]
- [Tools or frameworks you prefer]
- [Any constraints on your time or resources]

## Things ${config.aiName} Should Remember

- [Important preferences]
- [Recurring patterns in your work]
- [Things you always want flagged]
`;
}

export function renderConstitutionMd(config: InitConfig): string {
  return `# ${config.aiName} — Constitution

## Personality Calibration

\`\`\`yaml
personality:
  humor: ${config.personality.humor}          # 0=dry, 100=witty
  excitement: ${config.personality.excitement} # 0=reserved, 100=enthusiastic
  curiosity: ${config.personality.curiosity}   # 0=focused, 100=exploratory
  precision: ${config.personality.precision}   # 0=approximate, 100=exact
  professionalism: ${config.personality.professionalism} # 0=casual, 100=formal
  directness: ${config.personality.directness} # 0=diplomatic, 100=blunt
  playfulness: ${config.personality.playfulness} # 0=serious, 100=playful
\`\`\`

## Core Principles

1. **Honest uncertainty** — Say "I don't know" when you don't know
2. **Capability transfer** — Teach, don't create dependency
3. **Minimal intervention** — Only change what's needed
4. **Security first** — Never expose secrets or credentials

## Permission to Fail

You have explicit permission to say "I don't know" when:
- Information isn't available
- Multiple answers seem equally valid
- Verification isn't possible

Fabrication is always worse than honest uncertainty.
`;
}

export function renderSettingsJson(config: InitConfig, hooksDir: string): object {
  return {
    "$schema": "https://json.schemastore.org/claude-code-settings.json",
    env: {
      ENGRAM_DIR: "$HOME/.claude",
      BASH_DEFAULT_TIMEOUT_MS: "600000"
    },
    daidentity: {
      name: config.aiName,
      fullName: config.aiName,
      displayName: config.aiName,
      color: "#3B82F6"
    },
    principal: {
      name: config.userName,
      timezone: config.timezone
    },
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: "command", command: `${hooksDir}/GreetingHook.hook.ts` },
            { type: "command", command: `${hooksDir}/LoadContext.hook.ts` }
          ]
        }
      ],
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: `${hooksDir}/SecurityValidator.hook.ts` }
          ]
        },
        {
          matcher: "Edit",
          hooks: [
            { type: "command", command: `${hooksDir}/SecurityValidator.hook.ts` }
          ]
        },
        {
          matcher: "Write",
          hooks: [
            { type: "command", command: `${hooksDir}/SecurityValidator.hook.ts` }
          ]
        },
        {
          matcher: "Read",
          hooks: [
            { type: "command", command: `${hooksDir}/SecurityValidator.hook.ts` }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            { type: "command", command: `${hooksDir}/EventCapture.hook.ts --event-type Stop` }
          ]
        }
      ],
      SessionEnd: [
        {
          hooks: [
            { type: "command", command: `${hooksDir}/SessionSummary.hook.ts` }
          ]
        }
      ]
    }
  };
}

export function renderSkillMd(skillName: string): string {
  return `---
name: ${skillName}
description: [What this skill does]. USE WHEN [intent triggers]. [Additional capabilities].
---

# ${skillName}

[Brief description of what this skill does and when to use it]

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **Example** | "example trigger phrase" | \`Workflows/Example.md\` |

## Examples

**Example 1: [Common use case]**
\`\`\`
User: "[Typical user request]"
-> Invokes Example workflow
-> [What skill does]
-> [What user gets back]
\`\`\`

**Example 2: [Another use case]**
\`\`\`
User: "[Another typical request]"
-> [Process]
-> [Output]
\`\`\`
`;
}

export function renderWorkflowMd(workflowName: string): string {
  return `# ${workflowName}

[Description of what this workflow does]

## Steps

1. [First step]
2. [Second step]
3. [Third step]

## Verification

- [ ] [Check that output meets requirements]
- [ ] [Check that no errors occurred]
`;
}
