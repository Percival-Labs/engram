import { loadConfig, saveConfig, loadOrgPolicy, saveOrgPolicy, getOrgDir, listTeams } from '../lib/config';
import type { OrgPolicy, HardFloors, AutonomyLevel } from '../lib/team-types';
import { AUTONOMY_LEVELS } from '../lib/team-types';
import { mkdirSync, existsSync } from 'fs';

// ── Helpers ──────────────────────────────────────────────────────

const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;

function parseBoolean(value: string): boolean {
  const lower = value.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(lower)) return true;
  if (['false', '0', 'no', 'off'].includes(lower)) return false;
  throw new Error(`Invalid boolean value: "${value}". Use true/false.`);
}

function resolveNestedPath(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setNestedPath(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function createDefaultPolicy(userName: string): OrgPolicy {
  return {
    org_id: crypto.randomUUID(),
    org_name: userName + "'s Org",
    version: 1,
    updated_at: new Date().toISOString(),
    updated_by: userName,
    hard_floors: {
      max_autonomy: 'AUTONOMOUS' as AutonomyLevel,
      blocked_tools: [],
      blocked_providers: [],
      require_audit: false,
      data_classification_floor: 'public' as const,
    },
    soft_defaults: {},
  };
}

// ── Commands ─────────────────────────────────────────────────────

/**
 * Set a policy field using dot-notation key paths.
 */
export function orgPolicySet(key: string, value: string): void {
  const config = loadConfig();
  let policy = loadOrgPolicy() ?? createDefaultPolicy(config.userName);

  // ── Parse and validate by key path ────────────────────────────
  switch (key) {
    case 'hard_floors.max_autonomy': {
      if (!AUTONOMY_LEVELS.includes(value as AutonomyLevel)) {
        console.log(`  \x1b[33mInvalid autonomy level: "${value}"\x1b[0m`);
        console.log(`  \x1b[90mValid levels: ${AUTONOMY_LEVELS.join(', ')}\x1b[0m`);
        return;
      }
      policy.hard_floors.max_autonomy = value as AutonomyLevel;
      break;
    }

    case 'hard_floors.require_audit': {
      try {
        policy.hard_floors.require_audit = parseBoolean(value);
      } catch (e: any) {
        console.log(`  \x1b[33m${e.message}\x1b[0m`);
        return;
      }
      break;
    }

    case 'hard_floors.blocked_tools': {
      policy.hard_floors.blocked_tools = value.split(',').map(s => s.trim()).filter(Boolean);
      break;
    }

    case 'hard_floors.blocked_providers': {
      policy.hard_floors.blocked_providers = value.split(',').map(s => s.trim()).filter(Boolean);
      break;
    }

    case 'hard_floors.data_classification_floor': {
      if (!DATA_CLASSIFICATIONS.includes(value as any)) {
        console.log(`  \x1b[33mInvalid classification: "${value}"\x1b[0m`);
        console.log(`  \x1b[90mValid values: ${DATA_CLASSIFICATIONS.join(', ')}\x1b[0m`);
        return;
      }
      policy.hard_floors.data_classification_floor = value as HardFloors['data_classification_floor'];
      break;
    }

    case 'soft_defaults.model': {
      setNestedPath(policy, 'soft_defaults.model', value);
      break;
    }

    case 'soft_defaults.provider.id': {
      if (!policy.soft_defaults) policy.soft_defaults = {};
      if (!policy.soft_defaults.provider) policy.soft_defaults.provider = { id: value };
      else policy.soft_defaults.provider.id = value;
      break;
    }

    case 'budget.daily_token_limit':
    case 'budget.daily_cost_limit_cents':
    case 'budget.monthly_cost_limit_cents':
    case 'budget.alert_threshold_percent': {
      const num = Number(value);
      if (isNaN(num)) {
        console.log(`  \x1b[33mInvalid number: "${value}"\x1b[0m`);
        return;
      }
      if (!policy.budget) {
        policy.budget = { alert_threshold_percent: 80 };
      }
      const budgetKey = key.split('.')[1];
      (policy.budget as any)[budgetKey] = num;
      break;
    }

    case 'compliance.frameworks': {
      if (!policy.compliance) {
        policy.compliance = { frameworks: [], audit_retention_days: 90, require_hash_chain: false };
      }
      policy.compliance.frameworks = value.split(',').map(s => s.trim()).filter(Boolean);
      break;
    }

    case 'compliance.audit_retention_days': {
      const days = Number(value);
      if (isNaN(days)) {
        console.log(`  \x1b[33mInvalid number: "${value}"\x1b[0m`);
        return;
      }
      if (!policy.compliance) {
        policy.compliance = { frameworks: [], audit_retention_days: days, require_hash_chain: false };
      } else {
        policy.compliance.audit_retention_days = days;
      }
      break;
    }

    case 'compliance.require_hash_chain': {
      try {
        const bool = parseBoolean(value);
        if (!policy.compliance) {
          policy.compliance = { frameworks: [], audit_retention_days: 90, require_hash_chain: bool };
        } else {
          policy.compliance.require_hash_chain = bool;
        }
      } catch (e: any) {
        console.log(`  \x1b[33m${e.message}\x1b[0m`);
        return;
      }
      break;
    }

    default: {
      console.log(`  \x1b[33mUnknown policy key: "${key}"\x1b[0m`);
      console.log('');
      console.log('  \x1b[90mSupported keys:\x1b[0m');
      console.log('    hard_floors.max_autonomy');
      console.log('    hard_floors.require_audit');
      console.log('    hard_floors.blocked_tools');
      console.log('    hard_floors.blocked_providers');
      console.log('    hard_floors.data_classification_floor');
      console.log('    soft_defaults.model');
      console.log('    soft_defaults.provider.id');
      console.log('    budget.daily_token_limit');
      console.log('    budget.daily_cost_limit_cents');
      console.log('    budget.monthly_cost_limit_cents');
      console.log('    budget.alert_threshold_percent');
      console.log('    compliance.frameworks');
      console.log('    compliance.audit_retention_days');
      console.log('    compliance.require_hash_chain');
      return;
    }
  }

  // ── Increment version and timestamp ───────────────────────────
  policy.version += 1;
  policy.updated_at = new Date().toISOString();
  policy.updated_by = config.userName;

  // ── Persist ───────────────────────────────────────────────────
  saveOrgPolicy(policy);

  // ── Update config.org_id if not set ───────────────────────────
  if (!config.org_id) {
    config.org_id = policy.org_id;
    saveConfig(config);
  }

  console.log(`  \x1b[32mPolicy updated:\x1b[0m ${key} = ${value}`);
  console.log(`  \x1b[90mVersion ${policy.version} saved to ~/.engram/org/policy.json\x1b[0m`);
}

/**
 * Get a policy field (or show the full policy).
 */
export function orgPolicyGet(key?: string): void {
  const policy = loadOrgPolicy();

  if (!policy) {
    console.log('  \x1b[33mNo org policy configured.\x1b[0m');
    console.log('  \x1b[90mRun: engram org policy set <key> <value>\x1b[0m');
    return;
  }

  if (key) {
    const value = resolveNestedPath(policy as any, key);
    if (value === undefined) {
      console.log(`  \x1b[33mKey not found: "${key}"\x1b[0m`);
      return;
    }
    console.log(`  \x1b[1m${key}\x1b[0m = ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`);
  } else {
    console.log('');
    console.log('  \x1b[1mOrg Policy\x1b[0m');
    console.log('  =========');
    console.log('');
    console.log(JSON.stringify(policy, null, 2).split('\n').map(l => '  ' + l).join('\n'));
    console.log('');
  }
}

/**
 * Push policy to all teams (print confirmation).
 * Actual enforcement happens via PolicyEnforcer hook at runtime.
 */
export function orgPolicyPropagate(): void {
  const policy = loadOrgPolicy();

  if (!policy) {
    console.log('  \x1b[33mNo org policy configured.\x1b[0m');
    console.log('  \x1b[90mRun: engram org policy set <key> <value>\x1b[0m');
    return;
  }

  const teams = listTeams();

  if (teams.length === 0) {
    console.log('  \x1b[33mNo teams found.\x1b[0m');
    console.log('  \x1b[90mCreate a team first: engram team create <name>\x1b[0m');
    return;
  }

  console.log('');
  console.log(`  \x1b[1mPropagating policy v${policy.version}\x1b[0m`);
  console.log('');

  for (const team of teams) {
    console.log(`  \x1b[32m[ok]\x1b[0m ${team.name} \x1b[90m(${team.id})\x1b[0m`);
  }

  console.log('');
  console.log(`  \x1b[32mPolicy propagated to ${teams.length} team(s).\x1b[0m`);
  console.log('  \x1b[90mEnforcement is applied at runtime via PolicyEnforcer hook.\x1b[0m');
}
