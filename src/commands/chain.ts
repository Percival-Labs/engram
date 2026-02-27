/**
 * Chain Commands
 *
 * engram chain run <name> <task>
 * engram chain list
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, getEngramHome } from '../lib/config';
import { loadChainConfig, listChainConfigs } from '../lib/chains/types';
import { runChain } from '../lib/chains/executor';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

export async function chainRun(chainId: string, task: string): Promise<void> {
  const userConfig = loadConfig();
  let chainConfig;
  try {
    chainConfig = loadChainConfig(chainId);
  } catch (err) {
    console.log(`\n  ${YELLOW}${BOLD}Error:${RESET} ${err instanceof Error ? err.message : err}\n`);
    return;
  }

  // Display chain info
  console.log('');
  console.log(`  ${BOLD}Chain: ${chainConfig.name}${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  for (const step of chainConfig.steps) {
    const tools = step.tools?.join(', ') ?? 'none';
    const errStrat = step.on_error;
    console.log(`  ${CYAN}${step.name}${RESET} ${DIM}(tools: ${tools}, on_error: ${errStrat})${RESET}`);
  }
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  Task: ${task}`);
  console.log('');

  // Run
  console.log(`  ${DIM}Running chain...${RESET}\n`);
  const result = await runChain(chainConfig, task, userConfig);

  // Display step results
  for (const step of result.steps) {
    if (step.skipped) {
      console.log(`  ${YELLOW}${BOLD}[${step.step}]${RESET} ${DIM}(skipped: ${step.error ?? 'unknown'})${RESET}`);
    } else if (step.error) {
      console.log(`  ${RED}${BOLD}[${step.step}]${RESET} ${RED}Error: ${step.error}${RESET}`);
    } else {
      console.log(`  ${GREEN}${BOLD}[${step.step}]${RESET} ${DIM}(${step.model})${RESET}`);
      for (const line of step.output.split('\n')) {
        console.log(`  ${line}`);
      }
    }
    console.log('');
  }

  // Status
  if (result.success) {
    console.log(`  ${GREEN}${BOLD}Chain completed successfully${RESET}\n`);
  } else {
    console.log(`  ${RED}${BOLD}Chain aborted${RESET}\n`);
  }

  // Save results
  const runsDir = join(getEngramHome(), 'runs', result.id);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, 'meta.json'),
    JSON.stringify({
      id: result.id,
      chain: result.chain,
      task: result.task,
      started_at: result.started_at,
      completed_at: result.completed_at,
      success: result.success,
      steps: result.steps.map(s => ({ step: s.step, model: s.model, skipped: s.skipped, error: s.error })),
    }, null, 2),
  );
  writeFileSync(join(runsDir, 'final.md'), result.final_output);
  const stepsDir = join(runsDir, 'steps');
  mkdirSync(stepsDir, { recursive: true });
  for (const step of result.steps) {
    writeFileSync(join(stepsDir, `${step.step}.md`), step.output);
  }

  console.log(`  ${DIM}Results saved to ~/.engram/runs/${result.id}/${RESET}\n`);
}

export async function chainList(): Promise<void> {
  const chains = listChainConfigs();
  console.log('');
  console.log(`  ${BOLD}Available Chains${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);

  if (chains.length === 0) {
    console.log(`  ${DIM}No chains found. Create one at ~/.engram/chains/<name>.yaml${RESET}`);
  } else {
    for (const chain of chains) {
      try {
        const config = loadChainConfig(chain);
        const steps = config.steps.map(s => s.name).join(' → ');
        console.log(`  ${CYAN}${chain}${RESET}: ${steps}`);
      } catch {
        console.log(`  ${YELLOW}${chain}${RESET} ${DIM}(invalid config)${RESET}`);
      }
    }
  }
  console.log('');
}
