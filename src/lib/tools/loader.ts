// Custom Tool Loader
//
// Loads tool definitions from:
//   1. ~/.engram/tools/   (user-level custom tools, YAML)
//   2. skills/<name>/Tools/  (skill-bundled tools, YAML)
//
// YAML command tools execute by running a shell command template
// with input values substituted for {{param}} placeholders.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import YAML from 'yaml';
import type { AutonomyLevel } from '../team-types';
import { AUTONOMY_LEVELS } from '../team-types';
import type { ToolHandler, ToolResult } from './types';

const MAX_OUTPUT_CHARS = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

interface YAMLToolDef {
  name: string;
  description: string;
  required_autonomy: string;
  input_schema: Record<string, unknown>;
  command: string;
}

/**
 * Parse a YAML tool definition file into a ToolHandler.
 */
function yamlToHandler(def: YAMLToolDef): ToolHandler {
  // Validate autonomy level
  const autonomy = def.required_autonomy as AutonomyLevel;
  if (!AUTONOMY_LEVELS.includes(autonomy)) {
    throw new Error(
      `Invalid required_autonomy "${def.required_autonomy}" in tool "${def.name}". ` +
        `Must be one of: ${AUTONOMY_LEVELS.join(', ')}`,
    );
  }

  return {
    definition: {
      name: def.name,
      description: def.description,
      input_schema: def.input_schema,
    },
    requiredAutonomy: autonomy,
    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      // Substitute {{param}} placeholders in the command template
      let command = def.command;
      for (const [key, value] of Object.entries(input)) {
        const placeholder = `{{${key}}}`;
        // Escape single quotes in values for shell safety
        const safeValue = String(value).replace(/'/g, "'\\''");
        command = command.replaceAll(placeholder, safeValue);
      }

      return new Promise<ToolResult>((resolve) => {
        exec(
          command,
          { timeout: DEFAULT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
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
}

/**
 * Load all .yaml/.yml files from a directory, returning ToolHandlers.
 * Silently skips files that fail to parse.
 */
async function loadToolsFromDir(dir: string): Promise<ToolHandler[]> {
  const handlers: ToolHandler[] = [];

  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;

      try {
        const filePath = join(dir, entry);
        const raw = await readFile(filePath, 'utf-8');
        const def = YAML.parse(raw) as YAMLToolDef;

        if (!def.name || !def.command) {
          continue; // Skip incomplete definitions
        }

        handlers.push(yamlToHandler(def));
      } catch {
        // Skip malformed files — don't crash the loader
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }

  return handlers;
}

/**
 * Scan skills directories for bundled tools.
 * Looks for skills/<name>/Tools/ directories containing YAML files.
 */
async function loadSkillTools(skillsDir: string): Promise<ToolHandler[]> {
  const handlers: ToolHandler[] = [];

  try {
    const skills = await readdir(skillsDir);
    for (const skill of skills) {
      const toolsDir = join(skillsDir, skill, 'Tools');
      try {
        const info = await stat(toolsDir);
        if (info.isDirectory()) {
          const found = await loadToolsFromDir(toolsDir);
          handlers.push(...found);
        }
      } catch {
        // No Tools/ dir for this skill — that's fine
      }
    }
  } catch {
    // Skills dir doesn't exist
  }

  return handlers;
}

/**
 * Load all custom tools from user-level and skill-bundled sources.
 *
 * @param skillsDirs - Additional skill directories to scan (optional)
 * @returns Array of ToolHandler objects for all discovered custom tools
 */
export async function loadCustomTools(
  skillsDirs?: string[],
): Promise<ToolHandler[]> {
  const handlers: ToolHandler[] = [];

  // 1. User-level custom tools: ~/.engram/tools/
  const userToolsDir = join(homedir(), '.engram', 'tools');
  const userTools = await loadToolsFromDir(userToolsDir);
  handlers.push(...userTools);

  // 2. Skill-bundled tools: skills/*/Tools/
  const defaultSkillsDir = join(homedir(), '.engram', 'skills');
  const skillTools = await loadSkillTools(defaultSkillsDir);
  handlers.push(...skillTools);

  // 3. Additional skill directories (e.g., project-level)
  if (skillsDirs) {
    for (const dir of skillsDirs) {
      const extra = await loadSkillTools(dir);
      handlers.push(...extra);
    }
  }

  return handlers;
}
