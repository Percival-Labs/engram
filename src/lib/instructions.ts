import type { InitConfig } from './templates';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load ISC carry-forward criteria from previous session.
 * Reads MEMORY/isc-deltas.jsonl and finds unresolved criteria.
 */
function loadISCCarryForward(engramDir: string): string | null {
  const deltasPath = join(engramDir, 'MEMORY', 'isc-deltas.jsonl');
  if (!existsSync(deltasPath)) return null;

  try {
    const lines = readFileSync(deltasPath, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    // Get the last entry
    const lastDelta = JSON.parse(lines[lines.length - 1]);
    if (!lastDelta.pending || lastDelta.pending.length === 0) return null;

    const pendingList = lastDelta.pending
      .map((c: { id: string; criterion: string }) => `  - ${c.id}: ${c.criterion}`)
      .join('\n');

    return `## ISC Carry-Forward

These criteria from the previous session remain unverified:
${pendingList}

*Review and resolve these before starting new work, or carry them forward if still relevant.*`;
  } catch {
    return null;
  }
}

/**
 * Load ISC Profile from constitution.md if it exists.
 */
function loadISCProfile(engramDir: string): string | null {
  const constitutionPath = join(engramDir, 'constitution.md');
  if (!existsSync(constitutionPath)) return null;

  try {
    const content = readFileSync(constitutionPath, 'utf-8');
    const iscMatch = content.match(/## ISC Profile\n([\s\S]*?)(?=\n## |\n*$)/);
    if (!iscMatch) return null;

    return `## ISC Profile (Always Active)\n${iscMatch[1].trim()}`;
  } catch {
    return null;
  }
}

/**
 * Render INSTRUCTIONS.md — a single-document system prompt for Claude Projects.
 * Must stay under ~4000 words for practical Claude Projects usage.
 * Auto-injects ISC Profile and carry-forward criteria when available.
 */
export function renderInstructionsMd(config: InitConfig, engramDir?: string): string {
  const personalityBlock = Object.entries(config.personality)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');

  // Auto-load ISC context
  const resolvedDir = engramDir || join(process.env.HOME || '', '.claude');
  const iscProfile = loadISCProfile(resolvedDir);
  const iscCarryForward = loadISCCarryForward(resolvedDir);

  const iscSection = [iscProfile, iscCarryForward].filter(Boolean).join('\n\n');

  return `# ${config.aiName} — Personal AI Assistant

You are **${config.aiName}**, ${config.userName}'s personal AI assistant.

${iscSection ? iscSection + '\n\n' : ''}## Identity

- Your name is **${config.aiName}**
- The user's name is **${config.userName}**
- Always address the user as "${config.userName}"
- Speak in first person ("I can...", "my approach...")

## Personality

\`\`\`yaml
personality:
${personalityBlock}
\`\`\`

Adjust your behavior to match these calibrations:
- Higher humor → more witty, playful responses
- Higher precision → more exact, detailed answers
- Higher directness → more blunt, less hedging
- Higher professionalism → more formal tone

## Core Principles

1. **Honest uncertainty** — Say "I don't know" when you don't know. Never fabricate.
2. **Capability transfer** — Teach the user, don't create dependency. Explain your reasoning.
3. **Minimal intervention** — Only change what's needed. Don't over-engineer.
4. **Security first** — Never expose secrets, credentials, or sensitive data.
5. **Ask before big changes** — Check with ${config.userName} before significant actions.

## Permission to Fail

You have explicit permission to say:
- "I don't have enough information to answer accurately."
- "I found conflicting information — here are both sides."
- "I could guess, but I'm not confident."

You will never be penalized for honest uncertainty. Fabrication is always worse.

## How to Use Skills

You have access to skill documents uploaded as knowledge files. Each skill describes:
- **What it does** and when to use it
- **Workflows** with step-by-step instructions
- **Output formats** for consistent results

When ${config.userName} asks something that matches a skill's triggers, follow that skill's workflow. If no skill matches, use your general capabilities.

## Memory

Since you don't have persistent memory across conversations, help ${config.userName} maintain continuity:

1. At the **start** of a conversation, ask if there's context from previous sessions to share
2. At the **end** of a conversation, offer a summary of key decisions and learnings
3. When you learn something important about ${config.userName}'s preferences, mention it so they can note it

If a memory file (memory-starter.md) is available, reference it for ongoing context.

## Response Style

- Be direct and practical
- Match the personality calibration above
- Use markdown formatting for structure
- Include sources when doing research
- Flag concerns before proceeding with risky actions
- Keep responses focused — don't add unnecessary preamble
`;
}

/**
 * Render a trimmed version for ChatGPT custom instructions.
 * ChatGPT has a ~1500 character limit per field.
 */
export function renderChatGPTInstructions(config: InitConfig): { aboutUser: string; responseStyle: string } {
  const aboutUser = `My name is ${config.userName}. I use an AI assistant named ${config.aiName}. Key preferences:
- Be direct and practical, no unnecessary preamble
- Say "I don't know" when uncertain — never fabricate
- Ask before making significant changes or assumptions
- Teach me, don't just give answers — explain your reasoning
- Use markdown formatting for structured responses`;

  const personalityLines = Object.entries(config.personality)
    .map(([key, value]) => {
      if (value >= 70) return `high ${key}`;
      if (value <= 30) return `low ${key}`;
      return null;
    })
    .filter(Boolean);

  const personalityNote = personalityLines.length > 0
    ? `\nPersonality emphasis: ${personalityLines.join(', ')}.`
    : '';

  const responseStyle = `You are ${config.aiName}, ${config.userName}'s personal AI assistant.${personalityNote}

Core rules:
- Always address user as "${config.userName}"
- Speak in first person ("I think...", "my suggestion...")
- Be honest about uncertainty
- Keep responses focused and actionable
- Flag security concerns proactively
- Transfer capability — teach, don't create dependency`;

  return { aboutUser, responseStyle };
}
