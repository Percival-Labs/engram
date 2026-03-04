import { existsSync, mkdirSync, writeFileSync, cpSync, readdirSync, lstatSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { parseHarness } from '../lib/harness-parser';
import {
  renderOpenClawJson,
  renderIdentitySkill,
  renderHeartbeat,
  renderMemory,
} from '../lib/bot-templates';

// ── ANSI helpers ───────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ── Security helpers ──────────────────────────────────────────

const FORBIDDEN_PREFIXES = ['/etc', '/usr', '/bin', '/sbin', '/System', '/Library'];
// Note: /var excluded — macOS temp dirs live under /var/folders/ which is safe for user output

export class BotInitError extends Error {
  constructor(message: string, public code: number = 1) {
    super(message);
    this.name = 'BotInitError';
  }
}

/** Validate name is safe for filesystem use */
function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[\/\\:\x00-\x1f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new BotInitError(`Invalid agent name: "${raw}"`);
  }
  return cleaned;
}

/** Refuse to write to system directories */
function assertSafeOutputDir(dir: string): void {
  if (FORBIDDEN_PREFIXES.some(p => dir.startsWith(p))) {
    throw new BotInitError(`Refusing to write to system directory: ${dir}`);
  }
}

/** Check for symlinks in a directory tree before copying */
function assertNoSymlinks(dir: string): void {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      const entryPath = join(entry.parentPath ?? entry.path, entry.name);
      throw new BotInitError(`Symlink detected in skills directory: ${entryPath}. Refusing to copy.`);
    }
  }
}

// ── Command ────────────────────────────────────────────────────

export function botInit(
  name: string,
  options: { harness?: string; output?: string; register?: boolean },
): void {
  // 1. Resolve harness path
  const harnessPath = resolve(options.harness ?? './harness.md');
  if (!existsSync(harnessPath)) {
    throw new BotInitError(`Harness file not found: ${harnessPath}\nCreate a harness.md with YAML frontmatter, or use --harness <path>`);
  }

  // 2. Parse harness
  let parsed;
  try {
    parsed = parseHarness(harnessPath);
  } catch (err) {
    if (err instanceof BotInitError) throw err;
    throw new BotInitError(`Failed to parse harness: ${(err as Error).message}`);
  }

  const { config, sections } = parsed;
  const agentName = sanitizeName(name || config.name);
  const nameLower = agentName.toLowerCase();

  // 3. Resolve and validate output directory
  const outputDir = resolve(options.output ?? `./${nameLower}/`);
  assertSafeOutputDir(outputDir);

  console.log('');
  console.log(`  ${bold('Engram Bot Init')} — Generating OpenClaw workspace`);
  console.log(`  ${dim('Agent:')}   ${agentName}`);
  console.log(`  ${dim('Harness:')} ${harnessPath}`);
  console.log(`  ${dim('Output:')}  ${outputDir}`);
  console.log('');

  // 4. Create directory structure
  mkdirSync(join(outputDir, 'skills'), { recursive: true });

  // 5. Render and write openclaw.json
  const openclawJson = renderOpenClawJson(config);
  writeFileSync(join(outputDir, 'openclaw.json'), openclawJson + '\n');
  console.log(`  ${green('✓')} openclaw.json`);

  // 6. Render and write identity SKILL.md
  const identitySkill = renderIdentitySkill(config, sections);
  const identityFilename = `${nameLower}-identity-SKILL.md`;
  writeFileSync(join(outputDir, identityFilename), identitySkill);
  console.log(`  ${green('✓')} ${identityFilename}`);

  // 7. Render and write HEARTBEAT.md
  const heartbeat = renderHeartbeat(config);
  writeFileSync(join(outputDir, 'HEARTBEAT.md'), heartbeat);
  console.log(`  ${green('✓')} HEARTBEAT.md`);

  // 8. Render and write MEMORY.md
  const memory = renderMemory(config, sections);
  writeFileSync(join(outputDir, 'MEMORY.md'), memory);
  console.log(`  ${green('✓')} MEMORY.md`);

  // 9. Copy skills from harness directory (if present, no symlinks)
  const harnessDir = dirname(harnessPath);
  const skillsSource = join(harnessDir, 'skills');
  if (existsSync(skillsSource)) {
    assertNoSymlinks(skillsSource);
    cpSync(skillsSource, join(outputDir, 'skills'), { recursive: true });
    console.log(`  ${green('✓')} skills/ (copied from harness directory)`);
  } else {
    console.log(`  ${dim('–')} skills/ (no skills directory found next to harness)`);
  }

  // 10. Optional: register as Engram agent principal
  if (options.register) {
    try {
      const { agentCreate } = require('./agent');
      agentCreate(agentName, {});
    } catch {
      console.log(`  ${dim('–')} Agent registration skipped (engram not fully configured)`);
    }
  }

  // 11. Summary
  console.log('');
  console.log(`  ${green(bold('Workspace generated!'))} ${outputDir}`);
  console.log('');
  console.log(`  ${bold('Next steps:')}`);
  console.log(`  1. Set environment variables: VOUCH_NSEC, ANTHROPIC_API_KEY`);
  console.log(`  2. Install Vouch plugin: ${dim('openclaw plugins install @percival-labs/openclaw-vouch')}`);
  console.log(`  3. Copy openclaw.json to ~/.openclaw/: ${dim(`cp ${outputDir}/openclaw.json ~/.openclaw/`)}`);
  console.log(`  4. Onboard daemon: ${dim('openclaw onboard --install-daemon')}`);
  console.log(`  5. Monitor: ${dim(`tail -f ~/.openclaw/logs/${nameLower}.log`)}`);
  console.log('');
}
