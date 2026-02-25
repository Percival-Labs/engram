#!/usr/bin/env node
/**
 * EscalationHandler.hook.ts - Autonomy Escalation (PreToolUse)
 *
 * PURPOSE: When an agent tries to perform an action above its autonomy level,
 * creates an escalation request for human review instead of outright blocking.
 *
 * TRIGGER: PreToolUse
 *
 * INPUT:
 * - tool_name: Any tool name
 * - tool_input: Tool-specific input
 * - session_id: Current session identifier
 *
 * OUTPUT:
 * - stdout: JSON decision object
 *   - {"continue": true} -> Allow operation (within autonomy)
 *   - {"decision": "ask", "message": "..."} -> Escalate to human
 * - exit(0): Normal completion (with decision)
 *
 * SIDE EFFECTS:
 * - Writes to: ~/.engram/escalations/{timestamp}-{tool}.json
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: ~/.engram/config.json (agent config, autonomy level)
 * - COORDINATES WITH: PolicyEnforcer (complementary autonomy checks)
 * - MUST RUN BEFORE: Tool execution (blocking)
 * - MUST RUN AFTER: None
 *
 * ERROR HANDLING:
 * - Missing config: Allows all (assumes human principal)
 * - Unknown tool: Defaults to OBSERVE requirement
 * - Write failures for escalation file: Logged to stderr, still prompts human
 *
 * PERFORMANCE:
 * - Blocking: Yes (must complete before tool executes)
 * - Typical execution: <5ms
 * - Design: Fast path for human principals (immediate allow)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { readStdinText } from './lib/compat';
import { engramPath } from './lib/paths';

// ========================================
// Types
// ========================================

interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown> | string;
}

interface EngramConfig {
  autonomy_level?: string;
  principal_type?: string;
  userName?: string;
  agent_id?: string;
  agent_name?: string;
  team_ids?: string[];
  org_id?: string;
}

interface EscalationRecord {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  tool: string;
  tool_input_summary: string;
  required_autonomy: string;
  current_autonomy: string;
  status: 'pending' | 'approved' | 'denied';
}

type AutonomyLevel = 'OBSERVE' | 'SUGGEST' | 'ACT_SAFE' | 'ACT_FULL' | 'AUTONOMOUS';

// ========================================
// Config Loading
// ========================================

const engramHome = join(homedir(), '.engram');

function loadJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    console.error(`[EscalationHandler] Failed to parse: ${path}`);
    return null;
  }
}

// ========================================
// Autonomy Level Logic
// ========================================

const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  OBSERVE: 0,
  SUGGEST: 1,
  ACT_SAFE: 2,
  ACT_FULL: 3,
  AUTONOMOUS: 4,
};

// Patterns that indicate a Bash command is "safe" (read-only, informational)
const SAFE_BASH_PATTERNS = [
  /^\s*ls\b/,
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*echo\b/,
  /^\s*pwd\b/,
  /^\s*whoami\b/,
  /^\s*which\b/,
  /^\s*git\s+(status|log|diff|show|branch)\b/,
  /^\s*node\s+--version\b/,
  /^\s*bun\s+--version\b/,
  /^\s*npm\s+(list|ls|view|info)\b/,
  /^\s*wc\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*uptime\b/,
  /^\s*date\b/,
  /^\s*uname\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
];

function isSafeBashCommand(command: string): boolean {
  return SAFE_BASH_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Determine the minimum autonomy level required for a given tool.
 */
function getRequiredAutonomy(toolName: string, toolInput: Record<string, unknown> | string): AutonomyLevel {
  switch (toolName) {
    // Read-only tools - OBSERVE is sufficient
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
    case 'WebFetch':
      return 'OBSERVE';

    // Task/agent delegation - SUGGEST level
    case 'Task':
      return 'SUGGEST';

    // File modification tools - ACT_SAFE
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'ACT_SAFE';

    // Bash requires nuance
    case 'Bash': {
      const command = typeof toolInput === 'string'
        ? toolInput
        : (toolInput?.command as string) || '';
      if (isSafeBashCommand(command)) {
        return 'ACT_SAFE';
      }
      return 'ACT_FULL';
    }

    // Unknown tools default to OBSERVE (safe default)
    default:
      return 'OBSERVE';
  }
}

/**
 * Check if a given autonomy level meets or exceeds the required level.
 */
function autonomyMeetsRequirement(current: AutonomyLevel, required: AutonomyLevel): boolean {
  const currentRank = AUTONOMY_RANK[current] ?? -1;
  const requiredRank = AUTONOMY_RANK[required] ?? 0;
  return currentRank >= requiredRank;
}

// ========================================
// Escalation File Writing
// ========================================

function writeEscalation(record: EscalationRecord): void {
  const escalationDir = join(engramHome, 'escalations');

  if (!existsSync(escalationDir)) {
    mkdirSync(escalationDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${record.tool}.json`;
  const filePath = join(escalationDir, filename);

  try {
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    console.error(`[EscalationHandler] Escalation written: ${filename}`);
  } catch (error) {
    console.error(`[EscalationHandler] Failed to write escalation: ${error}`);
  }
}

// ========================================
// Input Summary
// ========================================

function summarizeInput(toolInput: Record<string, unknown> | string): string {
  if (typeof toolInput === 'string') {
    return toolInput.slice(0, 200);
  }

  // For Bash, show the command
  if (toolInput.command) {
    return String(toolInput.command).slice(0, 200);
  }

  // For file operations, show the path
  if (toolInput.file_path) {
    return `file: ${String(toolInput.file_path).slice(0, 200)}`;
  }

  // Generic: stringify first 200 chars
  const str = JSON.stringify(toolInput);
  return str.slice(0, 200);
}

// ========================================
// Main
// ========================================

async function main(): Promise<void> {
  let input: HookInput;

  try {
    const text = await readStdinText();

    if (!text.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    input = JSON.parse(text);
  } catch {
    // Parse error or timeout - fail open
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Load agent config
  const configPath = join(engramHome, 'config.json');
  const config = loadJsonFile<EngramConfig>(configPath);

  // If principal_type is not 'agent', allow everything (humans are not escalated)
  if (!config || config.principal_type !== 'agent') {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Get effective autonomy level
  const autonomy = (config.autonomy_level || 'AUTONOMOUS') as AutonomyLevel;

  // Validate autonomy level is recognized
  if (!(autonomy in AUTONOMY_RANK)) {
    console.error(`[EscalationHandler] Unknown autonomy level: ${autonomy}, allowing`);
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Determine required autonomy for this tool
  const required = getRequiredAutonomy(input.tool_name, input.tool_input);

  // Check if current autonomy meets requirement
  if (autonomyMeetsRequirement(autonomy, required)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Autonomy insufficient - create escalation
  const agentName = config.agent_name || config.userName || 'unknown-agent';
  const agentId = config.agent_id || config.userName || 'unknown';

  const escalation: EscalationRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    agent_name: agentName,
    tool: input.tool_name,
    tool_input_summary: summarizeInput(input.tool_input),
    required_autonomy: required,
    current_autonomy: autonomy,
    status: 'pending',
  };

  // Write escalation record
  writeEscalation(escalation);

  // Output ask decision to prompt the human
  console.log(JSON.stringify({
    decision: 'ask',
    message: `[ESCALATION] Agent '${agentName}' needs ${required} to run ${input.tool_name}. Current level: ${autonomy}. Approve?`,
  }));
}

// Run main, fail open on any error
main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
