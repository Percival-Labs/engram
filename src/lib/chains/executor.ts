/**
 * Chain Executor
 *
 * Runs steps sequentially. Each step receives the original task
 * plus all previous step outputs as context.
 */

import { randomUUID } from 'crypto';
import type { EngramConfig } from '../config';
import { getToolProvider } from '../providers/index';
import { ToolRegistry } from '../tools/registry';
import { registerBuiltins } from '../tools/builtins/index';
import { chatWithToolLoop } from '../tools/executor';
import type { ChainConfig, ChainResult, ChainStepResult } from './types';

const CONTEXT_TRUNCATION_LIMIT = 50_000;

function createScopedRegistry(allowedTools?: string[]): ToolRegistry {
  const full = new ToolRegistry();
  registerBuiltins(full);

  if (!allowedTools || allowedTools.length === 0) return full;

  const scoped = new ToolRegistry();
  for (const name of allowedTools) {
    const handler = full.get(name);
    if (handler) scoped.register(handler);
  }
  return scoped;
}

/**
 * Build context summary from previous steps.
 * Truncates older steps if accumulated context exceeds limit.
 */
function buildPriorContext(stepResults: ChainStepResult[]): string {
  if (stepResults.length === 0) return '';

  let context = 'Previous step outputs:\n\n';
  let totalLen = 0;

  // Work backwards — keep recent steps intact, summarize older ones
  const reversed = [...stepResults].reverse();
  const parts: string[] = [];

  for (const result of reversed) {
    const part = `### Step: ${result.step}\n${result.skipped ? '[Skipped]' : result.output}\n`;
    totalLen += part.length;

    if (totalLen > CONTEXT_TRUNCATION_LIMIT && parts.length > 0) {
      parts.push(`### Step: ${result.step}\n[Output truncated — ${result.output.length} chars]\n`);
    } else {
      parts.push(part);
    }
  }

  context += parts.reverse().join('\n');
  return context;
}

async function executeStep(
  step: ChainConfig['steps'][0],
  task: string,
  priorContext: string,
  userConfig: EngramConfig,
): Promise<{ output: string; model: string }> {
  const registry = createScopedRegistry(step.tools);
  const modelId = step.model ?? userConfig.provider.model;
  const provider = getToolProvider(userConfig.provider.id);

  let userMessage = `Task: ${task}`;
  if (priorContext) {
    userMessage += `\n\n${priorContext}`;
  }

  const stream = chatWithToolLoop({
    provider,
    config: {
      model: modelId,
      messages: [
        { role: 'system', content: step.system_prompt },
        { role: 'user', content: userMessage },
      ],
      apiKey: userConfig.provider.apiKey,
      baseUrl: userConfig.provider.baseUrl,
    },
    registry,
    autonomyLevel: step.autonomy ?? 'ACT_SAFE',
  });

  let output = '';
  for await (const event of stream) {
    if (event.type === 'text') output += event.text;
  }

  return { output, model: modelId };
}

export async function runChain(
  chainConfig: ChainConfig,
  task: string,
  userConfig: EngramConfig,
): Promise<ChainResult> {
  const runId = randomUUID().slice(0, 12);
  const startedAt = new Date().toISOString();
  const stepResults: ChainStepResult[] = [];
  let success = true;

  for (const step of chainConfig.steps) {
    const priorContext = buildPriorContext(stepResults);
    const maxRetries = step.max_retries ?? 1;

    let lastError: string | undefined;
    let stepOutput = '';
    let stepModel = step.model ?? userConfig.provider.model;
    let completed = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await executeStep(step, task, priorContext, userConfig);
        stepOutput = result.output;
        stepModel = result.model;
        completed = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);

        if (step.on_error === 'abort') break;
        if (step.on_error === 'skip') break;
        // retry: continue loop
      }
    }

    if (completed) {
      stepResults.push({
        step: step.name,
        output: stepOutput,
        model: stepModel,
        skipped: false,
      });
    } else if (step.on_error === 'skip') {
      stepResults.push({
        step: step.name,
        output: '',
        model: stepModel,
        skipped: true,
        error: lastError,
      });
    } else {
      // abort
      stepResults.push({
        step: step.name,
        output: '',
        model: stepModel,
        skipped: false,
        error: lastError,
      });
      success = false;
      break;
    }
  }

  const finalOutput = stepResults.length > 0
    ? stepResults[stepResults.length - 1].output
    : '';

  return {
    id: runId,
    chain: chainConfig.name,
    task,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    steps: stepResults,
    final_output: finalOutput,
    success,
  };
}
