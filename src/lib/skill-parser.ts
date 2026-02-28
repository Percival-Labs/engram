import { readFileSync } from 'fs';

export interface ISCEntry {
  id: string;
  criterion: string;
  verify: string;
  priority: 'critical' | 'important' | 'nice';
}

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  isc?: ISCEntry[];
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

    // Parse ISC entries from frontmatter
    const isc = parseISCFromFrontmatter(frontmatter);

    return {
      name: nameMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : '',
      path: filePath,
      isc: isc.length > 0 ? isc : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Parse ISC criteria from YAML frontmatter.
 * Expects format:
 * isc:
 *   - id: C1
 *     criterion: "text"
 *     verify: "method"
 *     priority: critical
 */
function parseISCFromFrontmatter(frontmatter: string): ISCEntry[] {
  const entries: ISCEntry[] = [];

  // Match the isc block — simple YAML array parsing
  const iscBlockMatch = frontmatter.match(/^isc:\s*\n((?:\s+-[\s\S]*?)*)(?=\n\S|\n*$)/m);
  if (!iscBlockMatch) return entries;

  const iscBlock = iscBlockMatch[1];
  // Split on array items (lines starting with "  - ")
  const items = iscBlock.split(/\n\s+-\s+/).filter(Boolean);

  for (const item of items) {
    const lines = item.replace(/^\s*-\s+/, '').split('\n');
    const fields: Record<string, string> = {};

    for (const line of lines) {
      const kvMatch = line.trim().match(/^(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        fields[kvMatch[1]] = kvMatch[2].trim();
      }
    }

    if (fields.id && fields.criterion && fields.verify) {
      const priority = fields.priority as ISCEntry['priority'];
      entries.push({
        id: fields.id,
        criterion: fields.criterion,
        verify: fields.verify,
        priority: ['critical', 'important', 'nice'].includes(priority) ? priority : 'important',
      });
    }
  }

  return entries;
}

export function extractUseWhen(description: string): string[] {
  const useWhenMatch = description.match(/USE WHEN\s+(.+?)(?:\.|$)/i);
  if (!useWhenMatch) return [];

  return useWhenMatch[1]
    .split(/\s+OR\s+/i)
    .map(trigger => trigger.trim().toLowerCase())
    .filter(Boolean);
}
