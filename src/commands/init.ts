import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, readdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  renderClaudeMd,
  renderContextMd,
  renderConstitutionMd,
  renderSettingsJson,
  type InitConfig,
} from '../lib/templates';
import {
  askAIName,
  askUserName,
  askTimezone,
  askPersonalitySlider,
  askExistingInstall,
} from '../lib/prompts';
import { skillIndex } from './skill-index';
import { getFrameworkRoot } from '../lib/paths';

const frameworkRoot = getFrameworkRoot();

export async function init(): Promise<void> {
  const targetDir = join(homedir(), '.claude');
  const hooksDir = join(targetDir, 'hooks');
  const skillsDir = join(targetDir, 'skills');

  console.log('');
  console.log('  Engram — Personal AI Infrastructure');
  console.log('  ====================================');
  console.log('');

  // ── Detect existing installation ──────────────────────────────────
  let mode: 'augment' | 'fresh' = 'fresh';

  if (existsSync(targetDir)) {
    mode = await askExistingInstall();
    console.log('');
  }

  // ── Gather user configuration ─────────────────────────────────────
  const aiName = await askAIName();
  const userName = await askUserName();
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
  console.log('  Setting up infrastructure...');
  console.log('');

  // ── Create directory structure ────────────────────────────────────
  const directories = [
    skillsDir,
    hooksDir,
    join(hooksDir, 'lib'),
    join(targetDir, 'MEMORY', 'WORK'),
    join(targetDir, 'MEMORY', 'LEARNING', 'SIGNALS'),
    join(targetDir, 'MEMORY', 'STATE'),
    join(targetDir, 'MEMORY', 'SECURITY'),
    join(targetDir, 'history', 'raw-outputs'),
  ];

  for (const dir of directories) {
    mkdirSync(dir, { recursive: true });
  }

  // ── Copy compiled hooks (Node-compatible .mjs bundles) ───────────
  const compiledHooksDir = join(frameworkRoot, 'dist', 'hooks');
  const sourceHooksDir = join(frameworkRoot, 'hooks');
  let hooksCount = 0;

  // Prefer compiled hooks (self-contained, Node-compatible)
  if (existsSync(compiledHooksDir)) {
    const hookFiles = readdirSync(compiledHooksDir).filter(
      f => f.endsWith('.hook.mjs')
    );

    for (const file of hookFiles) {
      cpSync(join(compiledHooksDir, file), join(hooksDir, file));
      chmodSync(join(hooksDir, file), 0o755);
      hooksCount++;
    }
  } else if (existsSync(sourceHooksDir)) {
    // Fallback to source hooks (requires bun)
    console.log('  Note: Using source hooks (requires bun runtime)');
    const hookFiles = readdirSync(sourceHooksDir).filter(
      f => f.endsWith('.hook.ts') || f.endsWith('.hook.js')
    );

    for (const file of hookFiles) {
      cpSync(join(sourceHooksDir, file), join(hooksDir, file));
      hooksCount++;
    }

    // Copy hooks/lib/ for source hooks
    const sourceHooksLibDir = join(sourceHooksDir, 'lib');
    if (existsSync(sourceHooksLibDir)) {
      cpSync(sourceHooksLibDir, join(hooksDir, 'lib'), { recursive: true });
    }
  }

  // ── Copy starter skills ───────────────────────────────────────────
  const sourceSkillsDir = join(frameworkRoot, 'skills');
  let skillsCount = 0;

  if (existsSync(sourceSkillsDir)) {
    const skillDirs = readdirSync(sourceSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of skillDirs) {
      const destDir = join(skillsDir, dir.name);
      cpSync(join(sourceSkillsDir, dir.name), destDir, { recursive: true });
      skillsCount++;
    }
  }

  // Determine which hook extension was installed
  const hookExt = existsSync(compiledHooksDir) ? '.hook.mjs' : '.hook.ts';

  // ── Copy patterns.example.yaml ────────────────────────────────────
  // Try compiled hooks dir first, then source hooks dir
  const patternsFromCompiled = join(compiledHooksDir, 'patterns.example.yaml');
  const patternsFromSource = join(frameworkRoot, 'hooks', 'patterns.example.yaml');
  const patternsSource = existsSync(patternsFromCompiled) ? patternsFromCompiled : patternsFromSource;

  if (existsSync(patternsSource)) {
    cpSync(patternsSource, join(targetDir, 'patterns.example.yaml'));
  }

  // ── Render and write config files ─────────────────────────────────
  // Generate skill registry string for CLAUDE.md
  let skillRegistry = '';

  // Run skill index to generate skill-index.json and build registry
  skillIndex();

  const skillIndexPath = join(skillsDir, 'skill-index.json');

  if (existsSync(skillIndexPath)) {
    try {
      const indexData = JSON.parse(readFileSync(skillIndexPath, 'utf-8'));
      if (Array.isArray(indexData) && indexData.length > 0) {
        skillRegistry = '| Skill | Description |\n|-------|-------------|\n';
        for (const entry of indexData) {
          skillRegistry += `| **${entry.name}** | ${entry.description} |\n`;
        }
      }
    } catch {
      // If skill-index.json is malformed, leave registry empty
    }
  }

  writeFileSync(join(targetDir, 'CLAUDE.md'), renderClaudeMd(config, skillRegistry));
  writeFileSync(join(targetDir, 'context.md'), renderContextMd(config));
  writeFileSync(join(targetDir, 'constitution.md'), renderConstitutionMd(config));

  // ── Generate settings.json ────────────────────────────────────────
  const settingsPath = join(targetDir, 'settings.json');
  const newSettings = renderSettingsJson(config, hooksDir, hookExt);

  if (mode === 'augment' && existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));

      // Merge: keep existing env vars, permissions; add/update hooks, daidentity, principal
      const merged = {
        ...existing,
        ...newSettings,
        env: {
          ...(existing.env || {}),
          ...(newSettings as any).env,
        },
        hooks: (newSettings as any).hooks,
        daidentity: (newSettings as any).daidentity,
        principal: (newSettings as any).principal,
      };

      // Preserve existing permissions if present
      if (existing.permissions) {
        merged.permissions = existing.permissions;
      }

      writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    } catch {
      // If existing settings.json is malformed, write clean
      writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
    }
  } else {
    writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
  }

  // ── chmod +x all hooks ────────────────────────────────────────────
  if (existsSync(hooksDir)) {
    const allHookFiles = readdirSync(hooksDir).filter(
      f => f.endsWith('.hook.ts') || f.endsWith('.hook.js') || f.endsWith('.hook.mjs')
    );

    for (const file of allHookFiles) {
      chmodSync(join(hooksDir, file), 0o755);
    }
  }

  // ── Print success ─────────────────────────────────────────────────
  console.log(`  AI infrastructure initialized!`);
  console.log('');
  console.log(`    Your AI: ${aiName}`);
  console.log(`    Config:  ~/.claude/`);
  console.log(`    Skills:  ${skillsCount} starter skills installed`);
  console.log(`    Hooks:   ${hooksCount} hooks active`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Open a new Claude Code session to activate');
  console.log("    2. Run 'engram skill create MySkill' to add custom skills");
  console.log('    3. Edit ~/.claude/context.md to personalize your context');
  console.log('');
}
