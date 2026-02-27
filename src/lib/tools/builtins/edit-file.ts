/**
 * Built-in Tool: edit_file
 *
 * Edits a file by replacing a specific string with new content.
 * Fails if the target string is not found or appears multiple times.
 * Requires ACT_SAFE autonomy — modifies existing files.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { ToolHandler, ToolResult } from '../types';

export const editFileTool: ToolHandler = {
  definition: {
    name: 'edit_file',
    description: 'Edit a file by replacing a specific string with new content',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact string to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'Replacement string',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  requiredAutonomy: 'ACT_SAFE',

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input.path as string;
    const oldString = input.old_string as string;
    const newString = input.new_string as string;

    try {
      const content = await readFile(path, 'utf-8');

      // Count occurrences
      let count = 0;
      let idx = 0;
      while ((idx = content.indexOf(oldString, idx)) !== -1) {
        count++;
        idx += oldString.length;
      }

      if (count === 0) {
        return {
          content: `old_string not found in ${path}`,
          is_error: true,
        };
      }

      if (count > 1) {
        return {
          content: `old_string found ${count} times in ${path} — must be unique. Provide more surrounding context to disambiguate.`,
          is_error: true,
        };
      }

      const updated = content.replace(oldString, newString);
      await writeFile(path, updated, 'utf-8');

      return { content: `Successfully edited ${path}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: message, is_error: true };
    }
  },
};
