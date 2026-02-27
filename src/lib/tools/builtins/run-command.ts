/**
 * Built-in Tool: run_command
 *
 * Executes a shell command and returns its output.
 * Requires ACT_FULL autonomy — shell commands can have arbitrary side effects.
 */

import { exec } from 'node:child_process';
import type { ToolHandler, ToolResult } from '../types';

const MAX_OUTPUT_CHARS = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export const runCommandTool: ToolHandler = {
  definition: {
    name: 'run_command',
    description: 'Execute a shell command and return its output',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
  },

  requiredAutonomy: 'ACT_FULL',

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input.command as string;
    const timeoutMs =
      typeof input.timeout_ms === 'number' ? input.timeout_ms : DEFAULT_TIMEOUT_MS;

    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const exitCode =
              error.code !== undefined ? ` (exit code ${error.code})` : '';
            let output = stderr || error.message;
            if (output.length > MAX_OUTPUT_CHARS) {
              output =
                output.slice(0, MAX_OUTPUT_CHARS) + '\n... [output truncated]';
            }
            resolve({
              content: `Command failed${exitCode}:\n${output}`,
              is_error: true,
            });
            return;
          }

          let output = stdout;
          if (output.length > MAX_OUTPUT_CHARS) {
            output =
              output.slice(0, MAX_OUTPUT_CHARS) + '\n... [output truncated]';
          }
          resolve({ content: output || '(no output)' });
        },
      );
    });
  },
};
