import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Flatten a skill directory into a single markdown document.
 * Combines SKILL.md + all Workflows/*.md into one readable file
 * suitable for uploading to Claude Projects as a knowledge file.
 */
export function flattenSkill(skillDir: string): string | null {
  const skillMdPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    return null;
  }

  let content = readFileSync(skillMdPath, 'utf-8');

  // Strip YAML frontmatter — not needed in flattened form
  content = content.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // Append workflows inline
  const workflowsDir = join(skillDir, 'Workflows');

  if (existsSync(workflowsDir)) {
    const workflows = readdirSync(workflowsDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    for (const file of workflows) {
      const workflowContent = readFileSync(join(workflowsDir, file), 'utf-8');
      const name = file.replace('.md', '');
      content += `\n---\n\n## Workflow: ${name}\n\n${workflowContent.trim()}\n`;
    }
  }

  return content.trim();
}

/**
 * Flatten all skills in a directory into individual documents.
 * Returns an array of { name, content } for each skill.
 */
export function flattenAllSkills(skillsDir: string): Array<{ name: string; content: string }> {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const results: Array<{ name: string; content: string }> = [];

  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const content = flattenSkill(join(skillsDir, dir.name));
    if (content) {
      results.push({ name: dir.name, content });
    }
  }

  return results;
}
