/**
 * Team Run Command
 *
 * engram team run <name> <task>
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, getEngramHome } from '../lib/config';
import { loadTeamConfig, validateTeamConfig } from '../lib/teams/team-config';
import { runTeam } from '../lib/teams/runner';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

export async function teamRun(teamId: string, task: string): Promise<void> {
  // Load configs
  const userConfig = loadConfig();
  let teamConfig;
  try {
    teamConfig = loadTeamConfig(teamId);
  } catch (err) {
    console.log(`\n  ${YELLOW}${BOLD}Error:${RESET} ${err instanceof Error ? err.message : err}\n`);
    return;
  }

  // Validate
  const errors = validateTeamConfig(teamConfig);
  if (errors.length > 0) {
    console.log(`\n  ${YELLOW}${BOLD}Team config errors:${RESET}`);
    for (const e of errors) console.log(`    - ${e}`);
    console.log('');
    return;
  }

  // Display team info
  console.log('');
  console.log(`  ${BOLD}Team: ${teamConfig.name}${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  Roles: ${teamConfig.roles.map(r => r.name).join(', ')}`);
  console.log(`  Mode:  ${teamConfig.orchestrator?.assignment_mode ?? 'rule'}`);
  console.log(`  Task:  ${task}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log('');

  // Run
  console.log(`  ${DIM}Running team...${RESET}\n`);
  const result = await runTeam(teamConfig, task, userConfig);

  // Display role outputs
  for (const [role, output] of result.role_outputs) {
    console.log(`  ${CYAN}${BOLD}[${role}]${RESET}`);
    const lines = output.split('\n');
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log('');
  }

  // Display synthesis
  if (result.role_outputs.size > 1) {
    console.log(`  ${GREEN}${BOLD}[Synthesis]${RESET}`);
    for (const line of result.synthesis.split('\n')) {
      console.log(`  ${line}`);
    }
    console.log('');
  }

  // Save results
  const runsDir = join(getEngramHome(), 'runs', result.id);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, 'meta.json'),
    JSON.stringify({
      id: result.id,
      team: teamConfig.name,
      task: result.task,
      started_at: result.started_at,
      completed_at: result.completed_at,
      roles: Array.from(result.role_outputs.keys()),
    }, null, 2),
  );
  writeFileSync(join(runsDir, 'synthesis.md'), result.synthesis);
  for (const [role, output] of result.role_outputs) {
    writeFileSync(join(runsDir, `${role}.md`), output);
  }

  console.log(`  ${DIM}Results saved to ~/.engram/runs/${result.id}/${RESET}\n`);
}
