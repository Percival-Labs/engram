import { readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseSkillFrontmatter, extractUseWhen } from '../lib/skill-parser';

export interface SkillIndexEntry {
  name: string;
  description: string;
  triggers: string[];
  path: string;
}

export function skillIndex(): void {
  const skillsDir = join(process.env.HOME || '', '.claude', 'skills');

  if (!existsSync(skillsDir)) {
    console.error('  No skills directory found at ~/.claude/skills/');
    process.exit(1);
  }

  const entries: SkillIndexEntry[] = [];
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const skillMdPath = join(skillsDir, dir.name, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const metadata = parseSkillFrontmatter(skillMdPath);
    if (!metadata) continue;

    entries.push({
      name: metadata.name,
      description: metadata.description,
      triggers: extractUseWhen(metadata.description),
      path: skillMdPath,
    });
  }

  const indexPath = join(skillsDir, 'skill-index.json');
  writeFileSync(indexPath, JSON.stringify(entries, null, 2));

  console.log(`  Indexed ${entries.length} skills -> ${indexPath}`);
  for (const entry of entries) {
    console.log(`    ${entry.name}: ${entry.triggers.length} triggers`);
  }
}
