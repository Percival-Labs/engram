/**
 * Config Critic
 *
 * Deterministic validation of generated team and chain configs.
 * No LLM calls — pure schema and safety checks.
 */

import { AUTONOMY_LEVELS } from '../team-types';
import type { AutonomyLevel } from '../team-types';

const KNOWN_BUILTINS = new Set(['read_file', 'write_file', 'edit_file', 'run_command']);
const HIGH_AUTONOMY: Set<string> = new Set(['ACT_FULL', 'AUTONOMOUS']);

export interface CriticResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function critiqueConfig(
  config: Record<string, unknown>,
  type: 'team' | 'chain',
): CriticResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (type === 'team') {
    critiqueTeam(config, issues, warnings);
  } else {
    critiqueChain(config, issues, warnings);
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

function critiqueTeam(
  config: Record<string, unknown>,
  issues: string[],
  warnings: string[],
): void {
  if (!config.name) issues.push('Missing team name');

  const roles = config.roles as Array<Record<string, unknown>> | undefined;
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    issues.push('Team must have at least one role');
    return;
  }

  const names = new Set<string>();
  for (const role of roles) {
    if (!role.name) issues.push('Role missing name');
    if (!role.system_prompt) issues.push(`Role "${role.name ?? '?'}": missing system_prompt`);

    const name = String(role.name ?? '');
    if (names.has(name)) issues.push(`Duplicate role name: "${name}"`);
    names.add(name);

    // Validate autonomy
    if (role.autonomy && !AUTONOMY_LEVELS.includes(role.autonomy as AutonomyLevel)) {
      issues.push(`Role "${name}": invalid autonomy "${role.autonomy}"`);
    }
    if (role.autonomy && HIGH_AUTONOMY.has(String(role.autonomy))) {
      warnings.push(`Role "${name}" has ${role.autonomy} autonomy — ensure this is intentional`);
    }

    // Validate tools
    const tools = role.tools as string[] | undefined;
    if (tools) {
      for (const tool of tools) {
        if (!KNOWN_BUILTINS.has(tool)) {
          warnings.push(`Role "${name}": unknown tool "${tool}" (may be a custom tool)`);
        }
      }
      if (tools.length > 5) {
        warnings.push(`Role "${name}" has ${tools.length} tools — consider splitting into sub-roles`);
      }
    }
  }

  // Validate orchestrator
  const orch = config.orchestrator as Record<string, unknown> | undefined;
  if (orch) {
    if (orch.max_parallel !== undefined && (typeof orch.max_parallel !== 'number' || orch.max_parallel < 1)) {
      issues.push('max_parallel must be a positive number');
    }
  }
}

function critiqueChain(
  config: Record<string, unknown>,
  issues: string[],
  warnings: string[],
): void {
  if (!config.name) issues.push('Missing chain name');

  const steps = config.steps as Array<Record<string, unknown>> | undefined;
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    issues.push('Chain must have at least one step');
    return;
  }

  const validErrors = new Set(['retry', 'skip', 'abort']);

  for (const step of steps) {
    if (!step.name) issues.push('Step missing name');
    if (!step.system_prompt) issues.push(`Step "${step.name ?? '?'}": missing system_prompt`);
    if (!step.on_error) issues.push(`Step "${step.name ?? '?'}": missing on_error strategy`);
    else if (!validErrors.has(String(step.on_error))) {
      issues.push(`Step "${step.name}": invalid on_error "${step.on_error}"`);
    }

    if (step.autonomy && !AUTONOMY_LEVELS.includes(step.autonomy as AutonomyLevel)) {
      issues.push(`Step "${step.name}": invalid autonomy "${step.autonomy}"`);
    }
    if (step.autonomy && HIGH_AUTONOMY.has(String(step.autonomy))) {
      warnings.push(`Step "${step.name}" has ${step.autonomy} autonomy — ensure this is intentional`);
    }
  }
}
