import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { flattenAllSkills } from '../lib/flatten-skill';
import { parseSkillFrontmatter, extractUseWhen } from '../lib/skill-parser';
import { getFrameworkRoot, getSkillsDir } from '../lib/paths';

const ENGRAM_VERSION = '0.2.3';

// ── Types ────────────────────────────────────────────────────────

interface ExportOptions {
  format?: string;
  output?: string;
  skillsDir?: string;
  includeUserSkills?: boolean;
}

interface OpenClawSkillInput {
  name: string;
  description: string;
  body: string;
  useWhenTriggers: string[];
}

interface ManifestSkill {
  name: string;
  description: string;
  path: string;
}

interface Manifest {
  generator: string;
  version: string;
  exportedAt: string;
  format: string;
  skills: ManifestSkill[];
}

// ── Pure functions ───────────────────────────────────────────────

/**
 * Build an OpenClaw-format SKILL.md from Engram skill data.
 */
export function buildOpenClawSkill(input: OpenClawSkillInput): string {
  const { name, description, body, useWhenTriggers } = input;

  // Build YAML frontmatter
  const frontmatter = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    'version: 1.0.0',
    'metadata:',
    '  openclaw:',
    '    source: engram',
    `    engram_version: "${ENGRAM_VERSION}"`,
    '---',
  ].join('\n');

  // Build body sections
  const sections: string[] = [];

  // "When to Activate" section from USE WHEN triggers
  if (useWhenTriggers.length > 0) {
    const triggerList = useWhenTriggers.map(t => `- "${t}"`).join('\n');
    sections.push(`## When to Activate\n\nThis skill activates on these triggers:\n${triggerList}`);
  }

  // Original body content
  sections.push(body.trim());

  return `${frontmatter}\n\n${sections.join('\n\n')}\n`;
}

/**
 * Generate the export manifest.
 */
export function generateManifest(skills: ManifestSkill[]): Manifest {
  return {
    generator: 'engram',
    version: ENGRAM_VERSION,
    exportedAt: new Date().toISOString(),
    format: 'openclaw',
    skills,
  };
}

// ── Main export command ──────────────────────────────────────────

/**
 * Export Engram skills to OpenClaw SKILL.md format.
 */
export async function exportOpenClaw(options: ExportOptions): Promise<void> {
  const format = options.format || 'openclaw';

  if (format !== 'openclaw') {
    console.error(`  Unsupported export format: ${format}. Currently only "openclaw" is supported.`);
    process.exit(1);
  }

  const outputDir = options.output || './engram-export';

  // Determine skills source directories
  const skillsDirs: string[] = [];

  if (options.skillsDir) {
    skillsDirs.push(options.skillsDir);
  } else {
    // Default: framework bundled skills
    const frameworkSkills = join(getFrameworkRoot(), 'skills');
    if (existsSync(frameworkSkills)) {
      skillsDirs.push(frameworkSkills);
    }
  }

  // Optionally include user-installed skills
  if (options.includeUserSkills) {
    const userSkills = getSkillsDir();
    if (existsSync(userSkills)) {
      skillsDirs.push(userSkills);
    }
  }

  console.log('');
  console.log('  Engram -- Export to OpenClaw');
  console.log('  ===========================');
  console.log('');

  // Collect and flatten all skills from all source dirs
  const manifestSkills: ManifestSkill[] = [];
  const seenNames = new Set<string>();

  for (const dir of skillsDirs) {
    if (!existsSync(dir)) continue;

    const flatSkills = flattenAllSkills(dir);

    for (const flat of flatSkills) {
      // Parse original frontmatter for metadata
      const skillMdPath = join(dir, flat.name, 'SKILL.md');
      const meta = parseSkillFrontmatter(skillMdPath);

      if (!meta) {
        console.log(`  [skip] ${flat.name} -- no valid frontmatter`);
        continue;
      }

      // Deduplicate by name (first source wins)
      if (seenNames.has(meta.name)) {
        console.log(`  [skip] ${meta.name} -- duplicate (already exported)`);
        continue;
      }
      seenNames.add(meta.name);

      // Extract USE WHEN triggers
      const triggers = extractUseWhen(meta.description);

      // Strip the USE WHEN clause from description for clean export
      const cleanDescription = meta.description
        .replace(/\s*USE WHEN\s+.+$/i, '')
        .replace(/\.\s*$/, '')
        .trim();

      // Build OpenClaw SKILL.md
      const openClawContent = buildOpenClawSkill({
        name: meta.name,
        description: cleanDescription || meta.description,
        body: flat.content,
        useWhenTriggers: triggers,
      });

      // Write to output directory
      const skillOutputDir = join(outputDir, 'skills', meta.name);
      mkdirSync(skillOutputDir, { recursive: true });
      writeFileSync(join(skillOutputDir, 'SKILL.md'), openClawContent);

      const relativePath = `skills/${meta.name}/SKILL.md`;
      manifestSkills.push({
        name: meta.name,
        description: cleanDescription || meta.description,
        path: relativePath,
      });

      console.log(`  [ok] ${meta.name}`);
    }
  }

  // Write manifest
  const manifest = generateManifest(manifestSkills);
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Summary
  console.log('');
  console.log(`  Exported ${manifestSkills.length} skill(s) to: ${outputDir}/`);
  console.log('');
  console.log('  Contents:');
  console.log('    manifest.json            Index of all exported skills');
  for (const s of manifestSkills) {
    console.log(`    ${s.path.padEnd(30)} ${s.description.slice(0, 50)}`);
  }
  console.log('');
}
