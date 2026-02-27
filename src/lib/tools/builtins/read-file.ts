/**
 * Built-in Tool: read_file
 *
 * Reads the contents of a file at the given path.
 * Requires OBSERVE autonomy — read-only, no side effects.
 */

import { readFile } from 'node:fs/promises';
import type { ToolHandler, ToolResult } from '../types';

export const readFileTool: ToolHandler = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative file path',
        },
      },
      required: ['path'],
    },
  },

  requiredAutonomy: 'OBSERVE',

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input.path as string;
    try {
      const content = await readFile(path, 'utf-8');
      return { content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: message, is_error: true };
    }
  },
};
