/**
 * Team & Enterprise Types
 *
 * Additive types for multi-principal team management.
 * These extend (never modify) the base EngramConfig.
 */

// ── Autonomy Levels ─────────────────────────────────────────────

export const AUTONOMY_LEVELS = ['OBSERVE', 'SUGGEST', 'ACT_SAFE', 'ACT_FULL', 'AUTONOMOUS'] as const;
export type AutonomyLevel = typeof AUTONOMY_LEVELS[number];

/** Numeric ordering for comparison: higher = more autonomy */
export const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  OBSERVE: 0,
  SUGGEST: 1,
  ACT_SAFE: 2,
  ACT_FULL: 3,
  AUTONOMOUS: 4,
};

/** Derive autonomy level from Vouch score (0-100) */
export function autonomyFromVouchScore(score: number): AutonomyLevel {
  if (score >= 80) return 'AUTONOMOUS';
  if (score >= 60) return 'ACT_FULL';
  if (score >= 40) return 'ACT_SAFE';
  if (score >= 20) return 'SUGGEST';
  return 'OBSERVE';
}

/** Return the more restrictive of two autonomy levels */
export function minAutonomy(a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel {
  return AUTONOMY_RANK[a] <= AUTONOMY_RANK[b] ? a : b;
}

// ── Principal ───────────────────────────────────────────────────

export interface Principal {
  id: string;
  type: 'human' | 'agent';
  nostr_pubkey?: string;
  vouch_score?: number;
  display_name: string;
  created_at: string;
  primary_team_id?: string;
  secondary_team_ids?: string[];
  autonomy_level: AutonomyLevel;
}

// ── Team ────────────────────────────────────────────────────────

export interface TeamMember {
  principal_id: string;
  role: 'owner' | 'admin' | 'member' | 'observer';
  joined_at: string;
  invited_by: string;
}

export interface TeamDefaults {
  provider?: {
    id: string;
    model?: string;
    baseUrl?: string;
  };
  personality?: Partial<{
    humor: number;
    excitement: number;
    curiosity: number;
    precision: number;
    professionalism: number;
    directness: number;
    playfulness: number;
  }>;
  model?: string;
  skills?: string[];
}

export interface Team {
  id: string;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  org_id?: string;
  members: TeamMember[];
  shared_skills_dir: string;
  shared_memory_dir: string;
  defaults: TeamDefaults;
  autonomy_ceiling: AutonomyLevel;
}

// ── Organization Policy ─────────────────────────────────────────

export interface HardFloors {
  max_autonomy: AutonomyLevel;
  blocked_tools: string[];
  blocked_providers: string[];
  require_audit: boolean;
  max_context_window?: number;
  data_classification_floor: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface SoftDefaults {
  provider?: {
    id: string;
    model?: string;
    baseUrl?: string;
  };
  model?: string;
  personality?: Partial<{
    humor: number;
    excitement: number;
    curiosity: number;
    precision: number;
    professionalism: number;
    directness: number;
    playfulness: number;
  }>;
}

export interface BudgetPolicy {
  daily_token_limit?: number;
  daily_cost_limit_cents?: number;
  monthly_cost_limit_cents?: number;
  alert_threshold_percent: number;
}

export interface CompliancePolicy {
  frameworks: string[];
  audit_retention_days: number;
  require_hash_chain: boolean;
  export_schedule?: string;
}

export interface OrgPolicy {
  org_id: string;
  org_name: string;
  version: number;
  updated_at: string;
  updated_by: string;
  hard_floors: HardFloors;
  soft_defaults: SoftDefaults;
  budget?: BudgetPolicy;
  compliance?: CompliancePolicy;
}

// ── Audit Entry ─────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  principal_id: string;
  team_id?: string;
  org_id?: string;
  action: string;
  tool?: string;
  tool_input_summary?: string;
  autonomy_level: AutonomyLevel;
  decision: 'allow' | 'block' | 'escalate';
  reason?: string;
  prev_hash: string;
  hash: string;
}

// ── Resolved Config ─────────────────────────────────────────────

export interface ResolvedConfig {
  max_autonomy: AutonomyLevel;
  blocked_tools: string[];
  require_audit: boolean;
  provider: {
    id: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
  skills: string[];
}
