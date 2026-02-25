#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init';
import { chat } from './commands/chat';
import { setup } from './commands/setup';
import { skillCreate } from './commands/skill-create';
import { skillIndex } from './commands/skill-index';
import { bundle } from './commands/bundle';
import { serve } from './commands/serve';
import { packageInstall } from './commands/package-install';
import { exportOpenClaw } from './commands/export-openclaw';
import { teamCreate, teamList, teamInvite, teamRemove } from './commands/team';
import { agentCreate, agentList, agentDecommission, agentMigrate } from './commands/agent';
import { orgPolicySet, orgPolicyGet, orgPolicyPropagate } from './commands/org';
import { complianceExport } from './commands/compliance';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getFrameworkRoot } from './lib/paths';

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(getFrameworkRoot(), 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.1.3';
  }
}

const program = new Command();

program
  .name('engram')
  .description('Engram — Personal AI Infrastructure')
  .version(getVersion());

program
  .command('chat', { isDefault: true })
  .description('Start a chat session with your AI')
  .option('--provider <id>', 'Override provider (anthropic, openai, ollama)')
  .option('--model <model>', 'Override model')
  .action(chat);

program
  .command('setup')
  .description('Run the first-time setup wizard')
  .action(setup);

program
  .command('init')
  .description('Initialize Claude Code infrastructure in ~/.claude/')
  .action(init);

program
  .command('bundle')
  .description('Generate a portable AI setup package for Claude Projects or ChatGPT')
  .option('-o, --output <dir>', 'Output directory', './engram-bundle')
  .option('--for <name>', 'Pre-fill user name')
  .action(bundle);

program
  .command('serve')
  .description('Start MCP memory server for Claude Desktop')
  .action(serve);

const pkg = program
  .command('package')
  .description('Manage skill packages');

pkg
  .command('install <path>')
  .description('Install a skill package from a directory')
  .action(packageInstall);

const skill = program
  .command('skill')
  .description('Manage skills');

skill
  .command('create <name>')
  .description('Create a new skill scaffold')
  .action(skillCreate);

program
  .command('export')
  .description('Export skills to external agent platforms')
  .option('-f, --format <type>', 'Target platform (openclaw)', 'openclaw')
  .option('-o, --output <dir>', 'Output directory', './engram-export')
  .option('--skills-dir <path>', 'Custom skills directory')
  .option('--include-user-skills', 'Include user-installed skills from ~/.claude/skills')
  .action(exportOpenClaw);

skill
  .command('index')
  .description('Regenerate skill-index.json')
  .action(skillIndex);

// ── Team management ─────────────────────────────────────────────

const team = program
  .command('team')
  .description('Manage teams');

team
  .command('create <name>')
  .description('Create a new team')
  .action(teamCreate);

team
  .command('list')
  .description('List all teams')
  .action(teamList);

team
  .command('invite <team> <email>')
  .description('Invite a member to a team')
  .action(teamInvite);

team
  .command('remove <team> <memberId>')
  .description('Remove a member from a team')
  .action(teamRemove);

// ── Agent management ────────────────────────────────────────────

const agent = program
  .command('agent')
  .description('Manage agent principals');

agent
  .command('create <name>')
  .description('Create a new agent')
  .option('--team <team>', 'Assign to primary team')
  .option('--provider <id>', 'AI provider override')
  .option('--model <model>', 'Model override')
  .action(agentCreate);

agent
  .command('list')
  .description('List all agents')
  .option('--team <team>', 'Filter by team name')
  .action(agentList);

agent
  .command('decommission <id>')
  .description('Decommission an agent')
  .option('--archive', 'Archive instead of delete')
  .action(agentDecommission);

agent
  .command('migrate <id> <team>')
  .description('Migrate agent to a different team')
  .action(agentMigrate);

// ── Organization policy ─────────────────────────────────────────

const org = program
  .command('org')
  .description('Manage organization');

const orgPolicy = org
  .command('policy')
  .description('Manage org policy');

orgPolicy
  .command('set <key> <value>')
  .description('Set a policy field (dot-notation)')
  .action(orgPolicySet);

orgPolicy
  .command('get [key]')
  .description('Get a policy field or show all')
  .action(orgPolicyGet);

orgPolicy
  .command('propagate')
  .description('Push policy to all teams')
  .action(orgPolicyPropagate);

// ── Compliance ──────────────────────────────────────────────────

const compliance = program
  .command('compliance')
  .description('Compliance and audit tools');

compliance
  .command('export <framework>')
  .description('Export audit data (soc2, eu-ai-act, nist-ai-rmf, iso-42001)')
  .option('--from <date>', 'Start date (ISO format)')
  .option('--to <date>', 'End date (ISO format)')
  .option('--format <type>', 'Output format (json, csv)', 'json')
  .action(complianceExport);

program.parse();
