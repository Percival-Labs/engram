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
import { usage } from './commands/usage';
import { teamCreate, teamList, teamInvite, teamRemove } from './commands/team';
import { teamRun } from './commands/team-run';
import { agentCreate, agentList, agentDecommission, agentMigrate } from './commands/agent';
import { agentGenerate } from './commands/agent-generate';
import { orgPolicySet, orgPolicyGet, orgPolicyPropagate } from './commands/org';
import { complianceExport } from './commands/compliance';
import { chainRun, chainList as chainListCmd } from './commands/chain';
import { iscCommand } from './commands/isc';
import { map } from './commands/map';
import { creditsBalance, creditsDeposit, creditsLimit, creditsMode } from './commands/credits';
import { botInit, BotInitError } from './commands/bot-init';
function getVersion(): string {
  // Hardcoded — bun bundler breaks import.meta.url and getFrameworkRoot()
  // when installed globally. Bump this when bumping package.json version.
  return '0.2.4';
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
  .command('usage')
  .description('Show token usage and cost tracking')
  .option('--week', 'Show last 7 days')
  .option('--month', 'Show last 30 days')
  .action(usage);

program
  .command('router')
  .description('Show routing configuration status')
  .action(async () => {
    const { loadRoutingConfig } = await import('./lib/router/index');
    const config = loadRoutingConfig();
    console.log('');
    console.log('  \x1b[1mRouting Configuration\x1b[0m');
    console.log('  \x1b[2m────────────────────────────────\x1b[0m');
    console.log(`  Enabled:    ${config.enabled ? '\x1b[32myes\x1b[0m' : '\x1b[33mno\x1b[0m'}`);
    console.log(`  Strategy:   ${config.strategy}`);
    console.log(`  Cascade:    ${config.cascade.enabled ? 'on' : 'off'}`);
    console.log(`  Threshold:  ${config.cascade.qualityThreshold}`);
    console.log(`  Max escl:   ${config.cascade.maxEscalations}`);
    console.log(`  Fallback:   ${config.fallback.chain.join(' → ')}`);
    console.log(`  Budget:     ${config.budgetGuard.dailyLimitCents > 0 ? `$${(config.budgetGuard.dailyLimitCents / 100).toFixed(2)}/day` : 'unlimited'}`);
    const modelCount = Object.keys(config.models).length;
    if (modelCount > 0) {
      console.log(`  Custom models: ${modelCount}`);
    }
    console.log('');
  });

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

program
  .command('serve-http')
  .description('Start HTTP server for Desktop app and external clients')
  .option('-p, --port <port>', 'Port number', '3939')
  .action(async (opts: { port: string }) => {
    const { serveHttp } = await import('./commands/serve-http');
    await serveHttp({ port: parseInt(opts.port, 10) });
  });

program
  .command('map')
  .description('Visualize your Engram infrastructure as an interactive graph')
  .option('-o, --output <path>', 'Output HTML file path')
  .option('--no-open', 'Generate without opening browser')
  .action(map);

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

team
  .command('run <name> <task>')
  .description('Run an agent team on a task')
  .action(teamRun);

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

agent
  .command('generate <description>')
  .description('Generate agent/team/chain configs from a description')
  .action(agentGenerate);

// ── Chain management ────────────────────────────────────────────

const chain = program
  .command('chain')
  .description('Manage agent chains');

chain
  .command('run <name> <task>')
  .description('Run an agent chain on a task')
  .action(chainRun);

chain
  .command('list')
  .description('List available chains')
  .action(chainListCmd);

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

// ── ISC (Ideal State Criteria) ─────────────────────────────────

const isc = program
  .command('isc')
  .description('Inspect and manage ISC (Ideal State Criteria)');

isc
  .command('init')
  .description('Create ISC profile in constitution')
  .action(() => iscCommand('init', []));

isc
  .command('status')
  .description('Show current ISC state')
  .action(() => iscCommand('status', []));

isc
  .command('add <criterion>')
  .description('Add a criterion (format: "text | Verify: method")')
  .action((criterion: string) => iscCommand('add', [criterion]));

isc
  .command('log')
  .description('Show ISC evolution history')
  .action(() => iscCommand('log', []));

// ── Credits management ─────────────────────────────────────────

const credits = program
  .command('credits')
  .description('Manage inference credits (balance, deposit, limits)');

credits
  .command('balance', { isDefault: true })
  .description('Show credit balance and spend limits')
  .action(creditsBalance);

credits
  .command('deposit <amount>')
  .description('Create a Lightning deposit for <amount> sats')
  .action(creditsDeposit);

credits
  .command('limit')
  .description('Set spend limits')
  .option('--daily <sats>', 'Daily limit in sats (or "none" to remove)')
  .option('--weekly <sats>', 'Weekly limit in sats (or "none" to remove)')
  .option('--monthly <sats>', 'Monthly limit in sats (or "none" to remove)')
  .action(creditsLimit);

credits
  .command('mode [mode]')
  .description('Get or set auth mode (transparent or private)')
  .action(creditsMode);

// ── Bot workspace management ──────────────────────────────────

const bot = program
  .command('bot')
  .description('Manage bot workspaces');

bot
  .command('init <name>')
  .description('Generate OpenClaw workspace from Engram harness')
  .option('--harness <file>', 'Path to harness.md', './harness.md')
  .option('-o, --output <dir>', 'Output directory')
  .option('--register', 'Also register as Engram agent principal')
  .action((name: string, opts: Record<string, unknown>) => {
    try {
      botInit(name, opts);
    } catch (err) {
      if (err instanceof BotInitError) {
        console.error(`  \x1b[31mError:\x1b[0m ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
  });

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
