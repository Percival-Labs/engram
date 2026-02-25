import { loadConfig, saveAgent, listAgents, loadAgent, getAgentsDir, listTeams, loadTeam } from '../lib/config';
import type { Principal, AutonomyLevel } from '../lib/team-types';
import { existsSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ── ANSI helpers ───────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

// ── agentCreate ────────────────────────────────────────────────

export function agentCreate(
  name: string,
  options: { team?: string; provider?: string; model?: string },
): void {
  loadConfig(); // ensure engram is set up

  const id = randomUUID();
  let primaryTeamId: string | undefined;

  if (options.team) {
    const teams = listTeams();
    const team = teams.find(t => t.name === options.team);
    if (!team) {
      console.error(`  ${red('Error:')} Team "${options.team}" not found.`);
      process.exit(1);
    }
    primaryTeamId = team.id;
  }

  const agent: Principal = {
    id,
    type: 'agent',
    display_name: name,
    created_at: new Date().toISOString(),
    primary_team_id: primaryTeamId,
    autonomy_level: 'OBSERVE' as AutonomyLevel,
    nostr_pubkey: undefined,
  };

  saveAgent(agent);

  console.log('');
  console.log(`  ${green(bold('Agent created!'))} ${name}`);
  console.log(`  ${dim('ID:')}    ${id}`);
  console.log(`  ${dim('Team:')}  ${options.team ?? 'none'}`);
  console.log(`  ${dim('Level:')} OBSERVE ${dim('(earns more via Vouch)')}`);
  console.log('');
}

// ── agentList ──────────────────────────────────────────────────

export function agentList(options: { team?: string }): void {
  let teamId: string | undefined;

  if (options.team) {
    const teams = listTeams();
    const team = teams.find(t => t.name === options.team);
    if (!team) {
      console.error(`  ${red('Error:')} Team "${options.team}" not found.`);
      process.exit(1);
    }
    teamId = team.id;
  }

  const agents = listAgents(teamId);

  if (agents.length === 0) {
    console.log('  No agents found.');
    return;
  }

  // Resolve team names for display
  const teams = listTeams();
  const teamNameMap = new Map(teams.map(t => [t.id, t.name]));

  // Column headers
  const header = `  ${'ID'.padEnd(38)} ${'Name'.padEnd(20)} ${'Type'.padEnd(8)} ${'Team'.padEnd(16)} ${'Autonomy'.padEnd(12)} Vouch Score`;
  const separator = `  ${''.padEnd(38, '-')} ${''.padEnd(20, '-')} ${''.padEnd(8, '-')} ${''.padEnd(16, '-')} ${''.padEnd(12, '-')} ${''.padEnd(11, '-')}`;

  console.log('');
  console.log(dim(header));
  console.log(dim(separator));

  for (const agent of agents) {
    const teamName = agent.primary_team_id
      ? teamNameMap.get(agent.primary_team_id) ?? dim('unknown')
      : dim('--');
    const score = agent.vouch_score !== undefined ? String(agent.vouch_score) : dim('--');

    console.log(
      `  ${agent.id.padEnd(38)} ${agent.display_name.padEnd(20)} ${agent.type.padEnd(8)} ${String(teamName).padEnd(16)} ${agent.autonomy_level.padEnd(12)} ${score}`,
    );
  }

  console.log('');
  console.log(dim(`  ${agents.length} agent(s) total`));
  console.log('');
}

// ── agentDecommission ──────────────────────────────────────────

export function agentDecommission(id: string, options: { archive?: boolean }): void {
  const agent = loadAgent(id);

  if (!agent) {
    console.error(`  ${red('Error:')} Agent "${id}" not found.`);
    process.exit(1);
  }

  const agentFile = join(getAgentsDir(), `${id}.json`);

  if (options.archive) {
    const archiveDir = join(getAgentsDir(), 'archive');
    mkdirSync(archiveDir, { recursive: true });
    const archivePath = join(archiveDir, `${id}.json`);
    renameSync(agentFile, archivePath);
    console.log('');
    console.log(`  ${yellow('Archived')} agent ${bold(agent.display_name)}`);
    console.log(`  ${dim(archivePath)}`);
    console.log('');
  } else {
    unlinkSync(agentFile);
    console.log('');
    console.log(`  ${red('Decommissioned')} agent ${bold(agent.display_name)}`);
    console.log(`  ${dim('Agent file removed.')}`);
    console.log('');
  }
}

// ── agentMigrate ───────────────────────────────────────────────

export function agentMigrate(id: string, teamName: string): void {
  const agent = loadAgent(id);

  if (!agent) {
    console.error(`  ${red('Error:')} Agent "${id}" not found.`);
    process.exit(1);
  }

  const teams = listTeams();
  const team = teams.find(t => t.name === teamName);

  if (!team) {
    console.error(`  ${red('Error:')} Team "${teamName}" not found.`);
    process.exit(1);
  }

  const previousTeamId = agent.primary_team_id;
  const previousTeamName = previousTeamId
    ? teams.find(t => t.id === previousTeamId)?.name ?? 'unknown'
    : 'none';

  agent.primary_team_id = team.id;
  saveAgent(agent);

  console.log('');
  console.log(`  ${green('Migrated')} agent ${bold(agent.display_name)}`);
  console.log(`  ${dim('From:')} ${previousTeamName}`);
  console.log(`  ${dim('To:')}   ${teamName}`);
  console.log('');
}
