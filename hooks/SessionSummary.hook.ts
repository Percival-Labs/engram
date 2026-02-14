#!/usr/bin/env bun
/**
 * SessionSummary.hook.ts - Mark Work Complete and Clear State (SessionEnd)
 *
 * PURPOSE:
 * Finalizes a session by marking the current work directory as COMPLETED
 * and clearing the session state. This ensures clean session boundaries
 * and accurate work tracking.
 *
 * TRIGGER: SessionEnd
 *
 * INPUT:
 * - stdin: Hook input JSON (session_id, transcript_path)
 * - Files: MEMORY/STATE/current-work.json
 *
 * OUTPUT:
 * - stdout: None
 * - stderr: Status messages
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Updates: MEMORY/WORK/<dir>/META.yaml (status: COMPLETED, completed_at timestamp)
 * - Deletes: MEMORY/STATE/current-work.json (clears session state)
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: Work creation hooks (expects WORK/ structure and current-work.json)
 * - MUST RUN BEFORE: None (final cleanup)
 *
 * STATE TRANSITIONS:
 * - META.yaml status: "ACTIVE" -> "COMPLETED"
 * - META.yaml completed_at: null -> ISO timestamp
 * - current-work.json: exists -> deleted
 *
 * ERROR HANDLING:
 * - No current work: Logs message, exits gracefully
 * - Missing META.yaml: Skips update, continues to state clear
 * - File operation failures: Logged to stderr
 *
 * PERFORMANCE:
 * - Non-blocking: Yes
 * - Typical execution: <50ms
 */

import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getISOTimestamp } from './lib/time';
import { engramPath } from './lib/paths';

const STATE_DIR = engramPath('MEMORY', 'STATE');
const CURRENT_WORK_FILE = join(STATE_DIR, 'current-work.json');
const WORK_DIR = engramPath('MEMORY', 'WORK');

interface CurrentWork {
  session_id: string;
  work_dir: string;
  created_at: string;
  item_count: number;
}

/**
 * Mark work directory as completed and clear session state
 */
function clearSessionWork(): void {
  try {
    if (!existsSync(CURRENT_WORK_FILE)) {
      console.error('[SessionSummary] No current work to complete');
      return;
    }

    // Read current work state
    const content = readFileSync(CURRENT_WORK_FILE, 'utf-8');
    const currentWork: CurrentWork = JSON.parse(content);

    // Mark work directory as COMPLETED
    if (currentWork.work_dir) {
      const metaPath = join(WORK_DIR, currentWork.work_dir, 'META.yaml');
      if (existsSync(metaPath)) {
        let metaContent = readFileSync(metaPath, 'utf-8');
        metaContent = metaContent.replace(/^status: "ACTIVE"$/m, 'status: "COMPLETED"');
        metaContent = metaContent.replace(/^completed_at: null$/m, `completed_at: "${getISOTimestamp()}"`);
        writeFileSync(metaPath, metaContent, 'utf-8');
        console.error(`[SessionSummary] Marked work directory as COMPLETED: ${currentWork.work_dir}`);
      }
    }

    // Delete state file
    unlinkSync(CURRENT_WORK_FILE);
    console.error('[SessionSummary] Cleared session work state');
  } catch (error) {
    console.error(`[SessionSummary] Error clearing session work: ${error}`);
  }
}

async function main() {
  try {
    // Read input from stdin (not strictly needed but matches hook pattern)
    const input = await Bun.stdin.text();
    if (!input || input.trim() === '') {
      process.exit(0);
    }

    // Mark work as complete and clear state
    clearSessionWork();

    console.error('[SessionSummary] Session ended, work marked complete');
    process.exit(0);
  } catch (error) {
    // Silent failure - don't disrupt workflow
    console.error(`[SessionSummary] SessionEnd hook error: ${error}`);
    process.exit(0);
  }
}

main();
