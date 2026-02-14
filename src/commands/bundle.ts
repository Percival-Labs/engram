import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderInstructionsMd, renderChatGPTInstructions } from '../lib/instructions';
import { renderContextMd, renderConstitutionMd, type InitConfig } from '../lib/templates';
import { flattenAllSkills } from '../lib/flatten-skill';
import {
  askAIName,
  askUserName,
  askTimezone,
  askPersonalitySlider,
} from '../lib/prompts';
import { getFrameworkRoot } from '../lib/paths';

const frameworkRoot = getFrameworkRoot();

interface BundleOptions {
  output?: string;
  for?: string;
}

export async function bundle(options: BundleOptions): Promise<void> {
  const outputDir = options.output || './engram-bundle';

  console.log('');
  console.log('  Engram — Bundle Generator');
  console.log('  =========================');
  console.log('');
  console.log('  Creates a portable AI setup package for Claude Projects or ChatGPT.');
  console.log('');

  // ── Gather configuration (skip name if --for provided) ─────────
  let userName: string;

  if (options.for) {
    userName = options.for;
    console.log(`  Generating bundle for: ${userName}`);
    console.log('');
  } else {
    userName = await askUserName();
  }

  const aiName = await askAIName();
  const timezone = await askTimezone();

  console.log('');
  console.log('  Personality calibration (0-100 for each trait):');
  console.log('');

  const humor = await askPersonalitySlider('Humor', '0=dry, 100=witty', 50);
  const excitement = await askPersonalitySlider('Excitement', '0=reserved, 100=enthusiastic', 50);
  const curiosity = await askPersonalitySlider('Curiosity', '0=focused, 100=exploratory', 70);
  const precision = await askPersonalitySlider('Precision', '0=approximate, 100=exact', 80);
  const professionalism = await askPersonalitySlider('Professionalism', '0=casual, 100=formal', 60);
  const directness = await askPersonalitySlider('Directness', '0=diplomatic, 100=blunt', 70);
  const playfulness = await askPersonalitySlider('Playfulness', '0=serious, 100=playful', 50);

  const config: InitConfig = {
    aiName,
    userName,
    timezone,
    personality: {
      humor,
      excitement,
      curiosity,
      precision,
      professionalism,
      directness,
      playfulness,
    },
  };

  console.log('');
  console.log('  Generating bundle...');
  console.log('');

  // ── Create output directory ────────────────────────────────────
  const skillsOutputDir = join(outputDir, 'skills');
  mkdirSync(skillsOutputDir, { recursive: true });

  // ── Generate INSTRUCTIONS.md ───────────────────────────────────
  const instructions = renderInstructionsMd(config);
  writeFileSync(join(outputDir, 'INSTRUCTIONS.md'), instructions);

  // ── Generate context.md ────────────────────────────────────────
  const context = renderContextMd(config);
  writeFileSync(join(outputDir, 'context.md'), context);

  // ── Flatten and copy skills ────────────────────────────────────
  const sourceSkillsDir = join(frameworkRoot, 'skills');
  const skills = flattenAllSkills(sourceSkillsDir);

  for (const skill of skills) {
    writeFileSync(join(skillsOutputDir, `${skill.name}.md`), skill.content);
  }

  // ── Generate memory starter ────────────────────────────────────
  const memoryStarter = renderMemoryStarter(config);
  writeFileSync(join(outputDir, 'memory-starter.md'), memoryStarter);

  // ── Generate SETUP.md ──────────────────────────────────────────
  const chatGptInstructions = renderChatGPTInstructions(config);
  const setup = renderSetupMd(config, skills.length, chatGptInstructions);
  writeFileSync(join(outputDir, 'SETUP.md'), setup);

  // ── Print success ──────────────────────────────────────────────
  console.log(`  Bundle generated at: ${outputDir}/`);
  console.log('');
  console.log('  Contents:');
  console.log('    SETUP.md               Platform-specific setup instructions');
  console.log('    INSTRUCTIONS.md        Combined system prompt (paste into Claude Project)');
  console.log('    context.md             Personal context template');
  console.log(`    skills/                ${skills.length} skill files (upload as knowledge)`);
  console.log('    memory-starter.md      Memory template');
  console.log('');
  console.log('  Next steps:');
  console.log('    Open SETUP.md and follow the instructions for your platform.');
  console.log('');
}

function renderMemoryStarter(config: InitConfig): string {
  return `# ${config.aiName} — Memory

*Use this file to track things ${config.aiName} learns about you across conversations.*
*Copy key insights here between sessions so ${config.aiName} can reference them.*

## Preferences

- [Add preferences as you discover them]

## Key Decisions

- [Record important decisions and their reasoning]

## Learnings

- [Things ${config.aiName} figured out that should persist]

## Active Projects

| Project | Status | Notes |
|---------|--------|-------|
| [Project name] | [active/paused/done] | [Key context] |
`;
}

function renderSetupMd(
  config: InitConfig,
  skillCount: number,
  chatGpt: { aboutUser: string; responseStyle: string }
): string {
  return `# ${config.aiName} — Setup Guide

This bundle was generated by [Engram](https://github.com/AlanCarroll/engram), a personal AI infrastructure framework.

It contains everything needed to set up **${config.aiName}** as your personal AI assistant.

## What's in This Bundle

| File | Purpose |
|------|---------|
| \`INSTRUCTIONS.md\` | System prompt — defines ${config.aiName}'s personality and behavior |
| \`context.md\` | Your personal context — edit this with your info |
| \`skills/*.md\` | ${skillCount} skill files — specialized capabilities |
| \`memory-starter.md\` | Memory template — track learnings across sessions |

---

## Setup: Claude.ai (Projects)

1. Go to [claude.ai](https://claude.ai) and click **Projects** in the sidebar
2. Click **New Project** and name it "**${config.aiName}**"
3. Open the project, then click the **gear icon** (Project Settings)
4. Under **Custom Instructions**, paste the entire contents of \`INSTRUCTIONS.md\`
5. Click **Add Content** and upload these files:
   - \`context.md\`
   - All files from the \`skills/\` folder
   - \`memory-starter.md\`
6. Start a new conversation in the project — ${config.aiName} is ready!

**Updating memory:** After meaningful conversations, copy key learnings into \`memory-starter.md\` and re-upload it to keep ${config.aiName} informed across sessions.

---

## Setup: Claude Desktop

Same steps as Claude.ai above — Claude Desktop uses the same Projects feature.

**Bonus:** If you install the Engram MCP server, ${config.aiName} gets persistent memory:

\`\`\`bash
# In Claude Desktop settings, add this MCP server:
npx engram-harness serve
\`\`\`

See the Engram docs for MCP setup details.

---

## Setup: ChatGPT

ChatGPT has more limited custom instructions, so we provide a trimmed version.

1. Go to [chatgpt.com](https://chatgpt.com) → **Settings** → **Personalization** → **Custom instructions**
2. In **"What would you like ChatGPT to know about you?"**, paste:

\`\`\`
${chatGpt.aboutUser}
\`\`\`

3. In **"How would you like ChatGPT to respond?"**, paste:

\`\`\`
${chatGpt.responseStyle}
\`\`\`

4. Click **Save**

**Note:** ChatGPT doesn't support project knowledge files the same way. For skills, you can paste individual skill documents at the start of conversations when needed.

---

## Customizing ${config.aiName}

### Edit context.md
Add your real information — projects you're working on, tools you prefer, communication style. The more context ${config.aiName} has, the better it can help.

### Adjust personality
The personality values in \`INSTRUCTIONS.md\` are tunable (0-100). Edit them to shift ${config.aiName}'s behavior:
- **humor**: 0=dry → 100=witty
- **precision**: 0=approximate → 100=exact
- **directness**: 0=diplomatic → 100=blunt
- And more — see the personality section in INSTRUCTIONS.md

### Add your own skills
Create new \`.md\` files following the pattern in the \`skills/\` folder and upload them as project knowledge.

---

*Generated by Engram v0.1.0*
`;
}
