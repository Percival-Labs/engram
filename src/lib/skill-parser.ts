import { readFileSync } from 'fs';

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

export function parseSkillFrontmatter(filePath: string): SkillMetadata | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : '',
      path: filePath,
    };
  } catch {
    return null;
  }
}

export function extractUseWhen(description: string): string[] {
  const useWhenMatch = description.match(/USE WHEN\s+(.+?)(?:\.|$)/i);
  if (!useWhenMatch) return [];

  return useWhenMatch[1]
    .split(/\s+OR\s+/i)
    .map(trigger => trigger.trim().toLowerCase())
    .filter(Boolean);
}
