/**
 * Built-in Tool: write_file
 *
 * Writes content to a file, creating parent directories if needed.
 * Requires ACT_SAFE autonomy — creates/modifies files.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ToolHandler, ToolResult } from '../types';

export const writeFileTool: ToolHandler = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file, creating it if it doesn\'t exist',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write to',
        },
        content: {
          type: 'string',
          description: 'Content to write',
        },
      },
      required: ['path', 'content'],
    },
  },

  requiredAutonomy: 'ACT_SAFE',

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input.path as string;
    const content = input.content as string;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return { content: `Successfully wrote ${content.length} bytes to ${path}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: message, is_error: true };
    }
  },
};
