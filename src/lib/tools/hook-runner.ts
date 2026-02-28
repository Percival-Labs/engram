/**
 * Hook Runner for Tool Execution
 *
 * Lightweight policy checks before a tool executes.
 * Reuses concepts from OrgPolicy (blocked_tools, autonomy, budget)
 * but as synchronous function calls rather than spawned processes.
 *
 * Also enforces ISC anti-criteria automatically when active criteria exist.
 */

import type { AutonomyLevel } from '../team-types';
import { AUTONOMY_RANK } from '../team-types';
import type { ToolHandler } from './types';

export interface ISCAntiCriterion {
  id: string;
  criterion: string;
  verify: string;
  /** Optional: tool names this anti-criterion applies to. If empty, applies to all. */
  appliesTo?: string[];
}

export interface HookContext {
  autonomyLevel: AutonomyLevel;
  blockedTools?: string[];
  budgetRemainingCents?: number;
  /** Active ISC anti-criteria — automatically checked on every tool call */
  iscAntiCriteria?: ISCAntiCriterion[];
}

export interface HookResult {
  continue: boolean;
  decision?: 'allow' | 'block';
  message?: string;
  /** If blocked by ISC, includes the violated criterion ID */
  iscViolation?: string;
}

/**
 * Run pre-execution checks for a tool call.
 * Returns { continue: true } if tool should execute,
 * or { continue: false, decision: 'block', message } if blocked.
 *
 * ISC anti-criteria are checked automatically when present in context.
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

  // Check ISC anti-criteria (automatic when present)
  if (context.iscAntiCriteria) {
    const violation = checkISCAntiCriteria(handler.definition.name, context.iscAntiCriteria);
    if (violation) {
      return {
        continue: false,
        decision: 'block',
        message: `ISC anti-criterion ${violation.id} violated: "${violation.criterion}" — tool "${handler.definition.name}" blocked`,
        iscViolation: violation.id,
      };
    }
  }

  return { continue: true, decision: 'allow' };
}

/**
 * Check if a tool call would violate any active ISC anti-criteria.
 * Returns the violated criterion or null if all clear.
 */
function checkISCAntiCriteria(
  toolName: string,
  antiCriteria: ISCAntiCriterion[],
): ISCAntiCriterion | null {
  for (const ac of antiCriteria) {
    // If anti-criterion specifies tools, only check for those
    if (ac.appliesTo && ac.appliesTo.length > 0) {
      if (!ac.appliesTo.includes(toolName)) continue;
    }
    // Anti-criterion applies — this is a violation
    // In practice, more sophisticated checks would inspect tool args,
    // but tool-level blocking is the foundation
    if (ac.appliesTo?.includes(toolName)) {
      return ac;
    }
  }
  return null;
}
