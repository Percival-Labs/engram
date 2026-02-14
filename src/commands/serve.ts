import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';

const ENGRAM_HOME = join(homedir(), '.engram');
const MEMORY_DIR = join(ENGRAM_HOME, 'memory');

const VALID_CATEGORIES = ['context', 'learnings', 'preferences'] as const;
type Category = typeof VALID_CATEGORIES[number];

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }

  // Create default files if they don't exist
  for (const category of VALID_CATEGORIES) {
    const filePath = join(MEMORY_DIR, `${category}.md`);
    if (!existsSync(filePath)) {
      const headers: Record<Category, string> = {
        context: '# Context\n\n*Personal context and background information.*\n',
        learnings: '# Learnings\n\n*Things learned across conversations.*\n',
        preferences: '# Preferences\n\n*User preferences and working style.*\n',
      };
      writeFileSync(filePath, headers[category]);
    }
  }
}

function getCategoryPath(category: string): string {
  return join(MEMORY_DIR, `${category}.md`);
}

function readCategory(category: string): string {
  const filePath = getCategoryPath(category);
  if (!existsSync(filePath)) {
    return '';
  }
  return readFileSync(filePath, 'utf-8');
}

function appendToCategory(category: string, content: string): void {
  const filePath = getCategoryPath(category);
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `\n- [${timestamp}] ${content}\n`;
  writeFileSync(filePath, existing + entry);
}

export async function serve(): Promise<void> {
  ensureMemoryDir();

  const server = new McpServer({
    name: 'engram-memory',
    version: '0.1.0',
  });

  // ── read_memory ────────────────────────────────────────────────
  server.tool(
    'read_memory',
    'Read a memory category (context, learnings, or preferences)',
    {
      category: z.enum(VALID_CATEGORIES).describe('Memory category to read'),
    },
    async ({ category }) => {
      const content = readCategory(category);
      return {
        content: [{ type: 'text' as const, text: content || `No ${category} memories yet.` }],
      };
    }
  );

  // ── write_memory ───────────────────────────────────────────────
  server.tool(
    'write_memory',
    'Append a new entry to a memory category',
    {
      category: z.enum(VALID_CATEGORIES).describe('Memory category to write to'),
      content: z.string().describe('The memory entry to append'),
    },
    async ({ category, content }) => {
      appendToCategory(category, content);
      return {
        content: [{ type: 'text' as const, text: `Saved to ${category}: ${content}` }],
      };
    }
  );

  // ── search_memory ──────────────────────────────────────────────
  server.tool(
    'search_memory',
    'Search across all memory categories for a keyword or phrase',
    {
      query: z.string().describe('Search term to find in memories'),
    },
    async ({ query }) => {
      const results: string[] = [];
      const queryLower = query.toLowerCase();

      for (const category of VALID_CATEGORIES) {
        const content = readCategory(category);
        const lines = content.split('\n');
        const matches = lines.filter(line =>
          line.toLowerCase().includes(queryLower)
        );
        if (matches.length > 0) {
          results.push(`## ${category}\n${matches.join('\n')}`);
        }
      }

      const text = results.length > 0
        ? results.join('\n\n')
        : `No matches found for "${query}".`;

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  // ── list_memories ──────────────────────────────────────────────
  server.tool(
    'list_memories',
    'List all memory categories and their sizes',
    {},
    async () => {
      const entries: string[] = [];

      for (const category of VALID_CATEGORIES) {
        const content = readCategory(category);
        const lines = content.split('\n').filter(l => l.trim().startsWith('- ['));
        const size = Buffer.byteLength(content, 'utf-8');
        entries.push(`- **${category}**: ${lines.length} entries (${size} bytes)`);
      }

      return {
        content: [{ type: 'text' as const, text: entries.join('\n') }],
      };
    }
  );

  // ── Start server ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
