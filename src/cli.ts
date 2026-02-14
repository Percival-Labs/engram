#!/usr/bin/env bun
import { Command } from 'commander';
import { init } from './commands/init';
import { skillCreate } from './commands/skill-create';
import { skillIndex } from './commands/skill-index';
import { bundle } from './commands/bundle';
import { serve } from './commands/serve';

const program = new Command();

program
  .name('engram')
  .description('Engram — Personal AI Infrastructure')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize AI infrastructure in ~/.claude/')
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

const skill = program
  .command('skill')
  .description('Manage skills');

skill
  .command('create <name>')
  .description('Create a new skill scaffold')
  .action(skillCreate);

skill
  .command('index')
  .description('Regenerate skill-index.json')
  .action(skillIndex);

program.parse();
