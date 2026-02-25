import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AutonomyLevel, Team, OrgPolicy, Principal } from './team-types';

export interface EngramConfig {
  version: 1;
  userName: string;
  aiName: string;
  timezone: string;
  personality: {
    humor: number;
    excitement: number;
    curiosity: number;
    precision: number;
    professionalism: number;
    directness: number;
    playfulness: number;
  };
  provider: {
    id: string;
    apiKey?: string;
    model: string;
    baseUrl?: string;
  };

  // ── Team/Enterprise fields (optional — free tier ignores) ───
  org_id?: string;
  team_ids?: string[];
  principal_type?: 'human' | 'agent';
  nostr_pubkey?: string;
  autonomy_level?: AutonomyLevel;
}

export function getEngramHome(): string {
  return join(homedir(), '.engram');
}

export function getConfigPath(): string {
  return join(getEngramHome(), 'config.json');
}

export function hasConfig(): boolean {
  return existsSync(getConfigPath());
}

export function loadConfig(): EngramConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    throw new Error('No Engram config found. Run `engram` to set up.');
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function saveConfig(config: EngramConfig): void {
  const dir = getEngramHome();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  chmodSync(getConfigPath(), 0o600);
}

// ── Team helpers ──────────────────────────────────────────────

export function getTeamsDir(): string {
  return join(getEngramHome(), 'teams');
}

export function getTeamDir(teamId: string): string {
  return join(getTeamsDir(), teamId);
}

export function loadTeam(teamId: string): Team | null {
  const teamPath = join(getTeamDir(teamId), 'team.json');
  if (!existsSync(teamPath)) return null;
  return JSON.parse(readFileSync(teamPath, 'utf-8'));
}

export function saveTeam(team: Team): void {
  const dir = getTeamDir(team.id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(join(dir, 'shared-skills'), { recursive: true });
  mkdirSync(join(dir, 'shared-memory'), { recursive: true });
  writeFileSync(join(dir, 'team.json'), JSON.stringify(team, null, 2));
}

export function listTeams(): Team[] {
  const dir = getTeamsDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const teams: Team[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const team = loadTeam(entry.name);
    if (team) teams.push(team);
  }
  return teams;
}

// ── Org helpers ───────────────────────────────────────────────

export function getOrgDir(): string {
  return join(getEngramHome(), 'org');
}

export function loadOrgPolicy(): OrgPolicy | null {
  const policyPath = join(getOrgDir(), 'policy.json');
  if (!existsSync(policyPath)) return null;
  return JSON.parse(readFileSync(policyPath, 'utf-8'));
}

export function saveOrgPolicy(policy: OrgPolicy): void {
  const dir = getOrgDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  // Append to history before overwriting
  const historyPath = join(dir, 'policy.history.jsonl');
  const existing = existsSync(join(dir, 'policy.json'))
    ? readFileSync(join(dir, 'policy.json'), 'utf-8')
    : null;
  if (existing) {
    writeFileSync(historyPath, existing + '\n', { flag: 'a' });
  }

  writeFileSync(join(dir, 'policy.json'), JSON.stringify(policy, null, 2));
}

// ── Agent helpers ─────────────────────────────────────────────

export function getAgentsDir(): string {
  return join(getEngramHome(), 'agents');
}

export function loadAgent(agentId: string): Principal | null {
  const agentPath = join(getAgentsDir(), `${agentId}.json`);
  if (!existsSync(agentPath)) return null;
  return JSON.parse(readFileSync(agentPath, 'utf-8'));
}

export function saveAgent(agent: Principal): void {
  const dir = getAgentsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${agent.id}.json`), JSON.stringify(agent, null, 2));
}

export function listAgents(teamId?: string): Principal[] {
  const dir = getAgentsDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).filter(f => f.endsWith('.json'));
  const agents: Principal[] = [];
  for (const file of entries) {
    const agent = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Principal;
    if (teamId && agent.primary_team_id !== teamId) continue;
    agents.push(agent);
  }
  return agents;
}
