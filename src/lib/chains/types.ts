/**
 * Chain Configuration Types
 *
 * Chains are sequential agent pipelines where each step's output
 * feeds into the next step's context.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { AutonomyLevel } from '../team-types';
import { getEngramHome } from '../config';

export type ErrorStrategy = 'retry' | 'skip' | 'abort';

export interface ChainStep {
  name: string;
  system_prompt: string;
  tools?: string[];
  model?: string;
  autonomy?: AutonomyLevel;
  on_error: ErrorStrategy;
  max_retries?: number;
}

export interface ChainConfig {
  name: string;
  steps: ChainStep[];
}

export interface ChainStepResult {
  step: string;
  output: string;
  model: string;
  skipped: boolean;
  error?: string;
}

export interface ChainResult {
  id: string;
  chain: string;
  task: string;
  started_at: string;
  completed_at: string;
  steps: ChainStepResult[];
  final_output: string;
  success: boolean;
}

export function loadChainConfig(chainId: string): ChainConfig {
  const yamlPath = join(getEngramHome(), 'chains', `${chainId}.yaml`);
  if (!existsSync(yamlPath)) {
    throw new Error(`Chain config not found: ${yamlPath}`);
  }
  const raw = readFileSync(yamlPath, 'utf-8');
  return YAML.parse(raw) as ChainConfig;
}

export function listChainConfigs(): string[] {
  const chainsDir = join(getEngramHome(), 'chains');
  if (!existsSync(chainsDir)) return [];

  return readdirSync(chainsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => f.replace(/\.ya?ml$/, ''));
}
