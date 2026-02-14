import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderSkillMd, renderWorkflowMd } from '../lib/templates';

export function skillCreate(name: string): void {
  // Validate TitleCase
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
    console.error(`Error: Skill name must be TitleCase (e.g., MySkill). Got: ${name}`);
    process.exit(1);
  }

  const skillsDir = join(process.env.HOME || '', '.claude', 'skills');
  const skillDir = join(skillsDir, name);

  if (existsSync(skillDir)) {
    console.error(`Error: Skill '${name}' already exists at ${skillDir}`);
    process.exit(1);
  }

  // Create directories
  mkdirSync(join(skillDir, 'Tools'), { recursive: true });
  mkdirSync(join(skillDir, 'Workflows'), { recursive: true });

  // Write SKILL.md
  writeFileSync(join(skillDir, 'SKILL.md'), renderSkillMd(name));

  // Write example workflow
  writeFileSync(join(skillDir, 'Workflows', 'Example.md'), renderWorkflowMd('Example'));

  console.log(`  Skill '${name}' created at ${skillDir}`);
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Edit ${join(skillDir, 'SKILL.md')} — update description and USE WHEN triggers`);
  console.log(`    2. Edit ${join(skillDir, 'Workflows', 'Example.md')} — define your workflow`);
  console.log("    3. Run 'engram skill index' to register the skill");
}
