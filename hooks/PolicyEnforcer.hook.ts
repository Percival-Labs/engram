#!/usr/bin/env node
/**
 * PolicyEnforcer.hook.ts - Org/Team Policy Enforcement (PreToolUse)
 *
 * PURPOSE: Enforces hard floor policies from org and team configs.
 * Checks blocked tools, autonomy levels, provider restrictions.
 *
 * TRIGGER: PreToolUse (all tools)
 *
 * INPUT:
 * - tool_name: Any tool name
 * - tool_input: Tool-specific input
 * - session_id: Current session identifier
 *
 * OUTPUT:
 * - stdout: JSON decision object
 *   - {"continue": true} -> Allow operation
 *   - {"decision": "block", "message": "..."} -> Block with reason
 * - exit(0): Normal completion (with decision)
 * - exit(2): Hard block (policy violation)
 *
 * SIDE EFFECTS:
 * - None (reads config only)
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: ~/.engram/org/policy.json, ~/.engram/config.json
 * - COORDINATES WITH: SecurityValidator (runs after)
 * - MUST RUN BEFORE: Tool execution (blocking)
 * - MUST RUN AFTER: SecurityValidator
 *
 * ERROR HANDLING:
 * - Missing org policy: Allows all (free tier behavior)
 * - Missing config: Uses AUTONOMOUS as default autonomy
 * - Parse errors: Logs warning, allows operation (fail-open)
 *
 * PERFORMANCE:
 * - Blocking: Yes (must complete before tool executes)
 * - Typical execution: <5ms
 * - Design: Fast path when no org policy exists
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
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

interface OrgPolicy {
  hard_floors?: {
    blocked_tools?: string[];
    blocked_commands?: string[];
  };
  autonomy_defaults?: Record<string, string>;
  require_audit?: boolean;
  budget?: {
    daily_token_limit?: number;
    daily_cost_limit_cents?: number;
    alert_threshold_percent?: number;
  };
}

interface EngramConfig {
  autonomy_level?: string;
  principal_type?: string;
  userName?: string;
  team_ids?: string[];
  org_id?: string;
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
    console.error(`[PolicyEnforcer] Failed to parse: ${path}`);
    return null;
  }
}

// ========================================
// Autonomy Level Logic
// ========================================

const AUTONOMY_ORDER: AutonomyLevel[] = ['OBSERVE', 'SUGGEST', 'ACT_SAFE', 'ACT_FULL', 'AUTONOMOUS'];

const AUTONOMY_ALLOWED_TOOLS: Record<AutonomyLevel, string[] | 'all'> = {
  OBSERVE: ['Read', 'Glob', 'Grep'],
  SUGGEST: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  ACT_SAFE: 'all', // everything except Bash with dangerous patterns
  ACT_FULL: 'all',
  AUTONOMOUS: 'all',
};

// Dangerous bash patterns that ACT_SAFE should block
const DANGEROUS_BASH_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b.*\|\s*bash\b/i,
  /\bsudo\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bformat\b/i,
];

function isToolAllowedForAutonomy(toolName: string, toolInput: Record<string, unknown> | string, autonomy: AutonomyLevel): boolean {
  const allowed = AUTONOMY_ALLOWED_TOOLS[autonomy];

  // ACT_FULL and AUTONOMOUS allow everything
  if (allowed === 'all' && autonomy !== 'ACT_SAFE') {
    return true;
  }

  // ACT_SAFE: allow everything except dangerous Bash commands
  if (autonomy === 'ACT_SAFE') {
    if (toolName === 'Bash') {
      const command = typeof toolInput === 'string'
        ? toolInput
        : (toolInput?.command as string) || '';
      return !DANGEROUS_BASH_PATTERNS.some(pattern => pattern.test(command));
    }
    return true;
  }

  // OBSERVE and SUGGEST: check allowlist
  if (Array.isArray(allowed)) {
    return allowed.includes(toolName);
  }

  return true;
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

  // Load org policy
  const orgPolicyPath = join(engramHome, 'org', 'policy.json');
  const orgPolicy = loadJsonFile<OrgPolicy>(orgPolicyPath);

  // No org policy = free tier, allow everything
  if (!orgPolicy) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Check blocked tools
  if (orgPolicy.hard_floors?.blocked_tools?.includes(input.tool_name)) {
    console.error(`[POLICY] BLOCKED: Tool '${input.tool_name}' is blocked by org policy`);
    console.log(JSON.stringify({
      decision: 'block',
      message: `[POLICY] Tool '${input.tool_name}' is blocked by organization policy.`
    }));
    process.exit(2);
  }

  // Load agent config for autonomy level
  const configPath = join(engramHome, 'config.json');
  const config = loadJsonFile<EngramConfig>(configPath);
  const autonomy = (config?.autonomy_level || 'AUTONOMOUS') as AutonomyLevel;

  // Validate autonomy level is recognized
  if (!AUTONOMY_ORDER.includes(autonomy)) {
    console.error(`[PolicyEnforcer] Unknown autonomy level: ${autonomy}, defaulting to AUTONOMOUS`);
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Check if tool is allowed for current autonomy level
  if (!isToolAllowedForAutonomy(input.tool_name, input.tool_input, autonomy)) {
    // Determine what autonomy would be needed
    let requiredLevel: AutonomyLevel = 'AUTONOMOUS';
    for (const level of AUTONOMY_ORDER) {
      if (isToolAllowedForAutonomy(input.tool_name, input.tool_input, level)) {
        requiredLevel = level;
        break;
      }
    }

    console.log(JSON.stringify({
      decision: 'block',
      message: `[POLICY] Action requires ${requiredLevel} autonomy. Current level: ${autonomy}. Escalate to team admin.`
    }));
    process.exit(2);
  }

  // All checks passed
  console.log(JSON.stringify({ continue: true }));
}

// Run main, fail open on any error
main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
