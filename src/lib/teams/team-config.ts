/**
 * Team Configuration — Schema, Loader, Validator
 *
 * Teams are defined as YAML files at ~/.engram/teams/<id>/team.yaml
 * Each team has roles with scoped tools, autonomy, and system prompts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { AutonomyLevel } from '../team-types';
import { AUTONOMY_LEVELS } from '../team-types';
import { getEngramHome } from '../config';

export interface TeamRole {
  name: string;
  system_prompt: string;
  skills?: string[];
  tools?: string[];
  model?: string;
  autonomy: AutonomyLevel;
  anti_scope?: string;
}

export interface TeamOrchestrator {
  assignment_mode: 'rule' | 'hybrid' | 'autonomous';
  coordination: 'task_list';
  max_parallel: number;
}

export interface TeamConfig {
  name: string;
  roles: TeamRole[];
  orchestrator: TeamOrchestrator;
}

export interface TeamRunResult {
  id: string;
  task: string;
  started_at: string;
  completed_at: string;
  role_outputs: Map<string, string>;
  synthesis: string;
}

export function loadTeamConfig(teamId: string): TeamConfig {
  const yamlPath = join(getEngramHome(), 'teams', teamId, 'team.yaml');
  if (!existsSync(yamlPath)) {
    throw new Error(`Team config not found: ${yamlPath}`);
  }
  const raw = readFileSync(yamlPath, 'utf-8');
  return YAML.parse(raw) as TeamConfig;
}

export function listTeamConfigs(): string[] {
  const teamsDir = join(getEngramHome(), 'teams');
  if (!existsSync(teamsDir)) return [];

  return readdirSync(teamsDir)
    .filter(entry => {
      const yamlPath = join(teamsDir, entry, 'team.yaml');
      try {
        return statSync(join(teamsDir, entry)).isDirectory() && existsSync(yamlPath);
      } catch {
        return false;
      }
    });
}

export function validateTeamConfig(config: TeamConfig): string[] {
  const errors: string[] = [];

  if (!config.name) errors.push('Missing team name');
  if (!config.roles || config.roles.length === 0) errors.push('Team must have at least one role');

  const roleNames = new Set<string>();
  for (const role of config.roles ?? []) {
    if (!role.name) errors.push('Role missing name');
    if (!role.system_prompt) errors.push(`Role "${role.name ?? '?'}": missing system_prompt`);
    if (role.autonomy && !AUTONOMY_LEVELS.includes(role.autonomy)) {
      errors.push(`Role "${role.name}": invalid autonomy "${role.autonomy}"`);
    }
    if (roleNames.has(role.name)) {
      errors.push(`Duplicate role name: "${role.name}"`);
    }
    roleNames.add(role.name);
  }

  if (config.orchestrator) {
    if (!['rule', 'hybrid', 'autonomous'].includes(config.orchestrator.assignment_mode)) {
      errors.push(`Invalid assignment_mode: "${config.orchestrator.assignment_mode}"`);
    }
    if (config.orchestrator.max_parallel !== undefined && config.orchestrator.max_parallel < 1) {
      errors.push('max_parallel must be >= 1');
    }
  }

  return errors;
}
