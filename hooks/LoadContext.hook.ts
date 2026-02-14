#!/usr/bin/env bun
/**
 * LoadContext.hook.ts - Inject Context at Session Start (SessionStart)
 *
 * PURPOSE:
 * The foundational context injection hook. Reads context files defined in
 * settings.json and outputs them as a <system-reminder> to stdout.
 *
 * TRIGGER: SessionStart
 *
 * INPUT:
 * - Environment: ENGRAM_DIR, TIME_ZONE
 * - Files: settings.json contextFiles array, MEMORY/STATE/progress/*.json
 *
 * OUTPUT:
 * - stdout: <system-reminder> containing loaded context files
 * - stdout: Active work summary if previous sessions have pending work
 * - stderr: Status messages and errors
 * - exit(0): Normal completion
 * - exit(1): Critical failure (no context files found)
 *
 * DESIGN PHILOSOPHY:
 * Load context files at session start. These are critical for consistent
 * behavior. The contextFiles array in settings.json controls which files
 * are loaded. Falls back to sensible defaults if not configured.
 *
 * ERROR HANDLING:
 * - Missing context files: Logged warning, continues (non-fatal)
 * - No context loaded at all: Fatal error, exits with code 1
 * - Progress file errors: Logged, continues (non-fatal)
 * - Date command failure: Falls back to ISO timestamp
 *
 * PERFORMANCE:
 * - Blocking: Yes (context is essential)
 * - Typical execution: <50ms
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getEngramDir } from './lib/paths';

async function getCurrentDate(): Promise<string> {
  try {
    const proc = Bun.spawn(['date', '+%Y-%m-%d %H:%M:%S %Z'], {
      stdout: 'pipe',
      env: { ...process.env, TZ: process.env.TIME_ZONE || 'UTC' }
    });
    const output = await new Response(proc.stdout).text();
    return output.trim();
  } catch (error) {
    console.error('Failed to get current date:', error);
    return new Date().toISOString();
  }
}

interface Settings {
  contextFiles?: string[];
  daidentity?: { name?: string; [key: string]: unknown };
  principal?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Load settings.json and return the settings object.
 */
function loadSettings(paiDir: string): Settings {
  const settingsPath = join(paiDir, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      console.error(`Warning: Failed to parse settings.json: ${err}`);
    }
  }
  return {};
}

/**
 * Load context files from settings.json contextFiles array.
 * Falls back to default paths if array not defined.
 */
function loadContextFiles(paiDir: string, settings: Settings): string {
  const defaultFiles = [
    'skills/CORE/SKILL.md',
  ];

  const contextFiles = settings.contextFiles || defaultFiles;
  let combinedContent = '';

  for (const relativePath of contextFiles) {
    const fullPath = join(paiDir, relativePath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf-8');
      if (combinedContent) combinedContent += '\n\n---\n\n';
      combinedContent += content;
      console.error(`Loaded ${relativePath} (${content.length} chars)`);
    } else {
      console.error(`Warning: Context file not found: ${relativePath}`);
    }
  }

  return combinedContent;
}

interface ProgressFile {
  project: string;
  status: string;
  updated: string;
  objectives: string[];
  next_steps: string[];
  handoff_notes: string;
}

async function checkActiveProgress(paiDir: string): Promise<string | null> {
  const progressDir = join(paiDir, 'MEMORY', 'STATE', 'progress');

  if (!existsSync(progressDir)) {
    return null;
  }

  try {
    const files = readdirSync(progressDir).filter(f => f.endsWith('-progress.json'));

    if (files.length === 0) {
      return null;
    }

    const activeProjects: ProgressFile[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(progressDir, file), 'utf-8');
        const progress = JSON.parse(content) as ProgressFile;
        if (progress.status === 'active') {
          activeProjects.push(progress);
        }
      } catch {
        // Skip malformed files
      }
    }

    if (activeProjects.length === 0) {
      return null;
    }

    // Build summary of active work
    let summary = '\nACTIVE WORK (from previous sessions):\n';

    for (const proj of activeProjects) {
      summary += `\n  ${proj.project}\n`;

      if (proj.objectives && proj.objectives.length > 0) {
        summary += '   Objectives:\n';
        proj.objectives.forEach(o => summary += `   - ${o}\n`);
      }

      if (proj.handoff_notes) {
        summary += `   Handoff: ${proj.handoff_notes}\n`;
      }

      if (proj.next_steps && proj.next_steps.length > 0) {
        summary += '   Next steps:\n';
        proj.next_steps.forEach(s => summary += `   -> ${s}\n`);
      }
    }

    return summary;
  } catch (error) {
    console.error('Error checking active progress:', error);
    return null;
  }
}

async function main() {
  try {
    const paiDir = getEngramDir();

    console.error('Reading core context...');

    // Load settings.json to get contextFiles array
    const settings = loadSettings(paiDir);
    console.error('Loaded settings.json');

    // Load all context files from settings.json array
    const contextContent = loadContextFiles(paiDir, settings);

    if (!contextContent) {
      console.error('ERROR: No context files loaded');
      process.exit(1);
    }

    // Get current date/time to prevent confusion about dates
    const currentDate = await getCurrentDate();
    console.error(`Current Date: ${currentDate}`);

    // Extract identity values from settings for injection into context
    const PRINCIPAL_NAME = settings.principal?.name || 'User';
    const DA_NAME = settings.daidentity?.name || 'Assistant';

    console.error(`Principal: ${PRINCIPAL_NAME}, DA: ${DA_NAME}`);

    const message = `<system-reminder>
CORE CONTEXT (Auto-loaded at Session Start)

CURRENT DATE/TIME: ${currentDate}

## ACTIVE IDENTITY (from settings.json)

The user's name is: **${PRINCIPAL_NAME}**
The assistant's name is: **${DA_NAME}**

- ALWAYS address the user as "${PRINCIPAL_NAME}" in greetings and responses
- The assistant should identify as "${DA_NAME}"

---

${contextContent}

---

This context is now active. Additional context loads dynamically as needed.
</system-reminder>`;

    // Write to stdout (will be captured by Claude Code)
    console.log(message);

    // Output success confirmation
    console.log('\nContext successfully loaded.');

    // Check for active progress files and display them
    const activeProgress = await checkActiveProgress(paiDir);
    if (activeProgress) {
      console.log(activeProgress);
      console.error('Active work found from previous sessions');
    }

    console.error('Context injected into session');
    process.exit(0);
  } catch (error) {
    console.error('ERROR: Context loading hook failed:', error);
    process.exit(1);
  }
}

main();
