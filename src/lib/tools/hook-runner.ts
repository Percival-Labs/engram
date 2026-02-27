/**
 * Hook Runner for Tool Execution
 *
 * Lightweight policy checks before a tool executes.
 * Reuses concepts from OrgPolicy (blocked_tools, autonomy, budget)
 * but as synchronous function calls rather than spawned processes.
 */

import type { AutonomyLevel } from '../team-types';
import { AUTONOMY_RANK } from '../team-types';
import type { ToolHandler } from './types';

export interface HookContext {
  autonomyLevel: AutonomyLevel;
  blockedTools?: string[];
  budgetRemainingCents?: number;
}

export interface HookResult {
  continue: boolean;
  decision?: 'allow' | 'block';
  message?: string;
}

/**
 * Run pre-execution checks for a tool call.
 * Returns { continue: true } if tool should execute,
 * or { continue: false, decision: 'block', message } if blocked.
 */
export function runToolHooks(
  handler: ToolHandler,
  context: HookContext,
): HookResult {
  // Check blocked tools list
  if (context.blockedTools?.includes(handler.definition.name)) {
    return {
      continue: false,
      decision: 'block',
      message: `Tool "${handler.definition.name}" is blocked by organization policy`,
    };
  }

  // Check autonomy level
  const requiredRank = AUTONOMY_RANK[handler.requiredAutonomy];
  const callerRank = AUTONOMY_RANK[context.autonomyLevel];

  if (requiredRank > callerRank) {
    return {
      continue: false,
      decision: 'block',
      message: `Tool "${handler.definition.name}" requires ${handler.requiredAutonomy} autonomy (current: ${context.autonomyLevel})`,
    };
  }

  // Check budget (if tracked)
  if (context.budgetRemainingCents !== undefined && context.budgetRemainingCents <= 0) {
    return {
      continue: false,
      decision: 'block',
      message: 'Budget exhausted — tool execution blocked',
    };
  }

  return { continue: true, decision: 'allow' };
}
