#!/usr/bin/env node
/**
 * BudgetTracker.hook.ts - Budget & Cost Tracking (PreToolUse)
 *
 * PURPOSE: Tracks usage against org budget limits.
 * Blocks operations when daily/monthly limits exceeded.
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
 *   - {"continue": true} -> Allow operation (within budget)
 *   - {"decision": "block", "message": "..."} -> Block (budget exceeded)
 * - exit(0): Normal completion (with decision)
 * - exit(2): Hard block (budget exceeded)
 *
 * SIDE EFFECTS:
 * - Writes to: ~/.engram/org/usage/{YYYY-MM-DD}.json
 * - Updates request count per tool invocation
 *
 * INTER-HOOK RELATIONSHIPS:
 * - DEPENDS ON: ~/.engram/org/policy.json (budget config)
 * - COORDINATES WITH: PolicyEnforcer (both check org policy)
 * - MUST RUN BEFORE: Tool execution (blocking)
 * - MUST RUN AFTER: None
 *
 * ERROR HANDLING:
 * - Missing org policy: Allows all (no budget enforced)
 * - Missing budget config: Allows all (no limits set)
 * - Missing usage file: Initializes fresh daily counter
 * - Write failures: Logged to stderr, allows operation (fail-open)
 *
 * PERFORMANCE:
 * - Blocking: Yes (must complete before tool executes)
 * - Typical execution: <5ms (file read + write)
 * - Design: Daily usage files, simple JSON counters
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
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

interface BudgetConfig {
  daily_token_limit?: number;
  daily_cost_limit_cents?: number;
  alert_threshold_percent?: number;
}

interface OrgPolicy {
  budget?: BudgetConfig;
  [key: string]: unknown;
}

interface DailyUsage {
  tokens: number;
  cost_cents: number;
  requests: number;
  last_updated: string;
}

// ========================================
// Config Loading
// ========================================

const engramHome = join(homedir(), '.engram');

function loadJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    console.error(`[BudgetTracker] Failed to parse: ${path}`);
    return null;
  }
}

// ========================================
// Usage Tracking
// ========================================

function getUsageDir(): string {
  return join(engramHome, 'org', 'usage');
}

function getTodayKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadDailyUsage(dateKey: string): DailyUsage {
  const usageDir = getUsageDir();
  const usagePath = join(usageDir, `${dateKey}.json`);

  const existing = loadJsonFile<DailyUsage>(usagePath);
  if (existing) return existing;

  // Initialize fresh daily counter
  return {
    tokens: 0,
    cost_cents: 0,
    requests: 0,
    last_updated: new Date().toISOString(),
  };
}

function saveDailyUsage(dateKey: string, usage: DailyUsage): void {
  const usageDir = getUsageDir();

  if (!existsSync(usageDir)) {
    mkdirSync(usageDir, { recursive: true });
  }

  const usagePath = join(usageDir, `${dateKey}.json`);
  usage.last_updated = new Date().toISOString();

  try {
    writeFileSync(usagePath, JSON.stringify(usage, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[BudgetTracker] Failed to write usage: ${error}`);
  }
}

// ========================================
// Budget Checking
// ========================================

function checkBudget(usage: DailyUsage, budget: BudgetConfig): { allowed: boolean; reason?: string; warning?: string } {
  // Check daily token limit
  if (budget.daily_token_limit && usage.tokens >= budget.daily_token_limit) {
    return {
      allowed: false,
      reason: `Daily token limit exceeded (${usage.tokens}/${budget.daily_token_limit}). Resets at midnight UTC.`,
    };
  }

  // Check daily cost limit
  if (budget.daily_cost_limit_cents && usage.cost_cents >= budget.daily_cost_limit_cents) {
    return {
      allowed: false,
      reason: `Daily cost limit exceeded (${usage.cost_cents}/${budget.daily_cost_limit_cents} cents). Resets at midnight UTC.`,
    };
  }

  // Check alert threshold (warning only, still allowed)
  const alertPercent = budget.alert_threshold_percent || 80;

  if (budget.daily_token_limit) {
    const tokenPercent = (usage.tokens / budget.daily_token_limit) * 100;
    if (tokenPercent >= alertPercent) {
      return {
        allowed: true,
        warning: `Token usage at ${tokenPercent.toFixed(1)}% of daily limit (${usage.tokens}/${budget.daily_token_limit})`,
      };
    }
  }

  if (budget.daily_cost_limit_cents) {
    const costPercent = (usage.cost_cents / budget.daily_cost_limit_cents) * 100;
    if (costPercent >= alertPercent) {
      return {
        allowed: true,
        warning: `Cost usage at ${costPercent.toFixed(1)}% of daily limit (${usage.cost_cents}/${budget.daily_cost_limit_cents} cents)`,
      };
    }
  }

  return { allowed: true };
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

  // No org policy or no budget config = no limits
  if (!orgPolicy?.budget) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const budget = orgPolicy.budget;
  const dateKey = getTodayKey();
  const usage = loadDailyUsage(dateKey);

  // Check budget limits
  const result = checkBudget(usage, budget);

  if (!result.allowed) {
    console.log(JSON.stringify({
      decision: 'block',
      message: `[BUDGET] ${result.reason}`,
    }));
    process.exit(2);
  }

  // Log warning if approaching threshold
  if (result.warning) {
    console.error(`[BUDGET] WARNING: ${result.warning}`);
  }

  // Increment request count and save
  usage.requests += 1;
  saveDailyUsage(dateKey, usage);

  // Allow operation
  console.log(JSON.stringify({ continue: true }));
}

// Run main, fail open on any error
main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
