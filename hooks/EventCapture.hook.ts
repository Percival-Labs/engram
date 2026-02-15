#!/usr/bin/env node
/**
 * EventCapture.hook.ts - Capture Hook Events to JSONL History (PostToolUse / SessionEnd)
 *
 * PURPOSE:
 * Captures hook events to daily JSONL files for audit trail and analysis.
 * Each day gets a single JSONL file in the history directory.
 *
 * TRIGGER: Any (configured per event type)
 *
 * INPUT:
 * - stdin: Hook event JSON (session_id, tool_name, tool_input, etc.)
 * - args: --event-type <type> (e.g., "PostToolUse", "SessionEnd")
 *
 * OUTPUT:
 * - stdout: None
 * - stderr: Status messages
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Appends to: MEMORY/history/raw-outputs/YYYY-MM/YYYY-MM-DD.jsonl
 *
 * ERROR HANDLING:
 * - Missing directories: Created automatically
 * - Parse errors: Logged, exits gracefully
 * - Write failures: Logged to stderr
 *
 * PERFORMANCE:
 * - Non-blocking: Yes
 * - Typical execution: <10ms
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { engramPath } from './lib/paths';
import { getDate, getYearMonth, getTimestamp } from './lib/time';
import { readStdinText } from './lib/compat';

interface HookEvent {
  timestamp: string;
  event_type: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Get the output JSONL file path for today
 */
function getOutputPath(): string {
  const yearMonth = getYearMonth();
  const date = getDate();
  return engramPath('MEMORY', 'history', 'raw-outputs', yearMonth, `${date}.jsonl`);
}

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  try {
    // Parse --event-type argument
    let eventType = 'unknown';
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--event-type' && args[i + 1]) {
        eventType = args[i + 1];
        break;
      }
    }

    const text = await readStdinText();
    if (!text || text.trim() === '') {
      process.exit(0);
    }

    let inputData: Record<string, unknown>;
    try {
      inputData = JSON.parse(text);
    } catch {
      console.error('[EventCapture] Failed to parse stdin JSON');
      process.exit(0);
    }

    // Build event record
    const event: HookEvent = {
      timestamp: getTimestamp(),
      event_type: eventType,
      ...inputData,
    };

    // Write to daily JSONL file
    const outputPath = getOutputPath();
    ensureOutputDir(outputPath);

    const line = JSON.stringify(event) + '\n';
    appendFileSync(outputPath, line, 'utf-8');

    console.error(`[EventCapture] Recorded ${eventType} event`);
    process.exit(0);
  } catch (error) {
    console.error(`[EventCapture] Error: ${error}`);
    process.exit(0);
  }
}

main();
