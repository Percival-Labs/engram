import { input, confirm } from '@inquirer/prompts';
import { loadConfig, saveConfig, getTeamsDir, getTeamDir, saveTeam, listTeams, loadTeam } from '../lib/config';
import type { Team, TeamMember } from '../lib/team-types';
import { randomUUID } from 'crypto';

// ── Create ─────────────────────────────────────────────────────

export async function teamCreate(name: string): Promise<void> {
  const config = loadConfig();

  const description = await input({
    message: 'Team description:',
    default: '',
  });

  const teamId = randomUUID();
  const now = new Date().toISOString();

  const ownerPrincipalId = config.nostr_pubkey ?? config.userName;

  const team: Team = {
    id: teamId,
    name,
    description,
    created_at: now,
    created_by: ownerPrincipalId,
    org_id: config.org_id,
    members: [
      {
        principal_id: ownerPrincipalId,
        role: 'owner',
        joined_at: now,
        invited_by: ownerPrincipalId,
      },
    ],
    shared_skills_dir: `${getTeamDir(teamId)}/shared-skills`,
    shared_memory_dir: `${getTeamDir(teamId)}/shared-memory`,
    defaults: {},
    autonomy_ceiling: 'ACT_SAFE',
  };

  saveTeam(team);

  // Add team to config
  if (!config.team_ids) {
    config.team_ids = [];
  }
  config.team_ids.push(teamId);
  saveConfig(config);

  console.log('');
  console.log(`  \x1b[32mTeam created!\x1b[0m`);
  console.log(`  \x1b[90mID: ${teamId}\x1b[0m`);
  console.log(`  \x1b[90mStored at ~/.engram/teams/${teamId}/\x1b[0m`);
  console.log('');
}

// ── List ───────────────────────────────────────────────────────

export function teamList(): void {
  const teams = listTeams();

  if (teams.length === 0) {
    console.log('  No teams found.');
    console.log('');
    return;
  }

  // Header
  console.log('');
  console.log('  \x1b[90mID                                   Name              Members  Created\x1b[0m');
  console.log('  \x1b[90m' + '─'.repeat(80) + '\x1b[0m');

  for (const team of teams) {
    const created = team.created_at.slice(0, 10);
    const id = team.id.padEnd(36);
    const name = team.name.padEnd(18);
    const members = String(team.members.length).padEnd(9);
    console.log(`  ${id} ${name} ${members}${created}`);
  }

  console.log('');
}

// ── Invite ─────────────────────────────────────────────────────

export function teamInvite(teamName: string, email: string): void {
  const teams = listTeams();
  const team = teams.find(t => t.name === teamName);

  if (!team) {
    console.log(`  \x1b[33mTeam "${teamName}" not found.\x1b[0m`);
    return;
  }

  const config = loadConfig();
  const invitedBy = config.nostr_pubkey ?? config.userName;
  const now = new Date().toISOString();

  const member: TeamMember = {
    principal_id: email,
    role: 'member',
    joined_at: now,
    invited_by: invitedBy,
  };

  team.members.push(member);
  saveTeam(team);

  console.log(`  \x1b[32mInvited ${email} to ${teamName}\x1b[0m`);
  console.log(`  \x1b[90mNote: Email delivery is not yet implemented. Invite recorded locally.\x1b[0m`);
  console.log('');
}

// ── Remove ─────────────────────────────────────────────────────

export function teamRemove(teamName: string, memberId: string): void {
  const teams = listTeams();
  const team = teams.find(t => t.name === teamName);

  if (!team) {
    console.log(`  \x1b[33mTeam "${teamName}" not found.\x1b[0m`);
    return;
  }

  const memberIndex = team.members.findIndex(m => m.principal_id === memberId);

  if (memberIndex === -1) {
    console.log(`  \x1b[33mMember "${memberId}" not found in team "${teamName}".\x1b[0m`);
    return;
  }

  const member = team.members[memberIndex];

  if (member.role === 'owner') {
    console.log(`  \x1b[33mCannot remove the team owner.\x1b[0m`);
    return;
  }

  team.members.splice(memberIndex, 1);
  saveTeam(team);

  console.log(`  \x1b[32mRemoved ${memberId} from ${teamName}\x1b[0m`);
  console.log('');
}
