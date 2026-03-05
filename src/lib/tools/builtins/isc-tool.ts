/**
 * ISC Tool — Built-in tool for agents to manage ISC state.
 *
 * Exposes ISC operations (add criteria, update status, set phase, verify)
 * as a tool the LLM can call during execution. Works with the ISC runtime
 * engine to persist state across turns and restarts.
 */

import type { ToolHandler, ToolResult } from '../types';
import type { ToolDefinition } from '../../providers/types';
import type { AutonomyLevel } from '../../team-types';
import { ISCEngine } from '../../isc-runtime';
import type { CriterionPriority, CriterionStatus } from '../../isc-runtime';

const definition: ToolDefinition = {
  name: 'isc_update',
  description:
    'Manage Ideal State Criteria (ISC) for the current task. ' +
    'Use this to add criteria, update status, change phases, and verify completion. ' +
    'ISC state persists across restarts.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: [
          'add_criterion',
          'add_anti',
          'update_status',
          'modify_criterion',
          'remove_criterion',
          'set_phase',
          'flag_violation',
          'verify',
          'status',
        ],
        description: 'The ISC operation to perform.',
      },
      id: {
        type: 'string',
        description: 'Criterion ID (e.g., ISC-RC-C1). Required for most actions.',
      },
      text: {
        type: 'string',
        description: 'Criterion text. Required for add_criterion and add_anti.',
      },
      verify: {
        type: 'string',
        description: 'Verification method. Required for add_criterion and add_anti.',
      },
      priority: {
        type: 'string',
        enum: ['CRITICAL', 'IMPORTANT', 'NICE'],
        description: 'Priority tier. Required for add_criterion.',
      },
      status: {
        type: 'string',
        enum: ['pending', 'passed', 'failed'],
        description: 'New status. Required for update_status.',
      },
      phase: {
        type: 'string',
        description: 'Phase name. Required for set_phase.',
      },
      notes: {
        type: 'string',
        description: 'Optional notes for status updates or violation flags.',
      },
      reason: {
        type: 'string',
        description: 'Reason for removal. Required for remove_criterion.',
      },
    },
    required: ['action'],
  },
};

// Module-level engine reference — set via setEngine()
let engineInstance: ISCEngine | null = null;

/**
 * Set the ISC engine instance for this tool.
 * Must be called before the tool is used (typically in agent startup).
 */
export function setISCEngine(engine: ISCEngine): void {
  engineInstance = engine;
}

function getEngine(): ISCEngine {
  if (!engineInstance) {
    throw new Error('ISC engine not initialized. Call setISCEngine() during agent startup.');
  }
  return engineInstance;
}

async function execute(input: Record<string, unknown>): Promise<ToolResult> {
  const engine = getEngine();
  const action = input.action as string;

  switch (action) {
    case 'add_criterion': {
      const id = input.id as string;
      const text = input.text as string;
      const verify = input.verify as string;
      const priority = (input.priority as CriterionPriority) ?? 'IMPORTANT';

      if (!id || !text || !verify) {
        return { content: 'Error: add_criterion requires id, text, and verify fields.', is_error: true };
      }

      engine.addCriteria([{ id, text, verify, priority }]);
      return { content: `Added criterion ${id}: ${text} [${priority}]` };
    }

    case 'add_anti': {
      const id = input.id as string;
      const text = input.text as string;
      const verify = input.verify as string;

      if (!id || !text || !verify) {
        return { content: 'Error: add_anti requires id, text, and verify fields.', is_error: true };
      }

      engine.addAntiCriteria([{ id, text, verify }]);
      return { content: `Added anti-criterion ${id}: ${text}` };
    }

    case 'update_status': {
      const id = input.id as string;
      const status = input.status as CriterionStatus;
      const notes = input.notes as string | undefined;

      if (!id || !status) {
        return { content: 'Error: update_status requires id and status fields.', is_error: true };
      }

      engine.updateStatus(id, status, notes);
      return { content: `Updated ${id} → ${status}${notes ? ` (${notes})` : ''}` };
    }

    case 'modify_criterion': {
      const id = input.id as string;
      const text = input.text as string;
      const verify = input.verify as string | undefined;

      if (!id || !text) {
        return { content: 'Error: modify_criterion requires id and text fields.', is_error: true };
      }

      engine.modifyCriterion(id, text, verify);
      return { content: `Modified ${id}: ${text}` };
    }

    case 'remove_criterion': {
      const id = input.id as string;
      const reason = input.reason as string;

      if (!id || !reason) {
        return { content: 'Error: remove_criterion requires id and reason fields.', is_error: true };
      }

      engine.removeCriterion(id, reason);
      return { content: `Removed ${id}: ${reason}` };
    }

    case 'set_phase': {
      const phase = input.phase as string;

      if (!phase) {
        return { content: 'Error: set_phase requires phase field.', is_error: true };
      }

      engine.setPhase(phase);
      return { content: `Phase set to: ${phase}\n\n${engine.inject()}` };
    }

    case 'flag_violation': {
      const id = input.id as string;
      const notes = input.notes as string;

      if (!id || !notes) {
        return { content: 'Error: flag_violation requires id and notes fields.', is_error: true };
      }

      engine.flagViolation(id, notes);
      return { content: `VIOLATION flagged on ${id}: ${notes}` };
    }

    case 'verify': {
      const report = engine.verify();
      const lines: string[] = [
        'ISC Verification Report',
        '─'.repeat(40),
        `Task: ${report.task}`,
        `Phase: ${report.phase}`,
        `Total: ${report.total} | Passed: ${report.passed} | Failed: ${report.failed} | Pending: ${report.pending}`,
        `Ship Ready: ${report.shipReady ? 'YES' : 'NO'}`,
      ];

      if (report.criticalFailed.length > 0) {
        lines.push('', 'CRITICAL FAILURES:');
        for (const c of report.criticalFailed) {
          lines.push(`  ! ${c.id}: ${c.text}`);
        }
      }

      if (report.criticalPending.length > 0) {
        lines.push('', 'CRITICAL PENDING:');
        for (const c of report.criticalPending) {
          lines.push(`  ? ${c.id}: ${c.text}`);
        }
      }

      if (report.violations.length > 0) {
        lines.push('', 'VIOLATIONS:');
        for (const v of report.violations) {
          lines.push(`  ! ${v.id}: ${v.text} — ${v.violationNote}`);
        }
      }

      return { content: lines.join('\n') };
    }

    case 'status': {
      return { content: engine.inject() };
    }

    default:
      return { content: `Unknown ISC action: ${action}`, is_error: true };
  }
}

export const iscToolHandler: ToolHandler = {
  definition,
  execute,
  requiredAutonomy: 'OBSERVE' as AutonomyLevel,
};
