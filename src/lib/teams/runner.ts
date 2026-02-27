/**
 * Team Runner
 *
 * Orchestrates multi-role team execution.
 * Each role runs with its own scoped tools, autonomy, and system prompt.
 * Roles execute in parallel (up to max_parallel).
 */

import { randomUUID } from 'crypto';
import type { EngramConfig } from '../config';
import { getToolProvider } from '../providers/index';
import { ToolRegistry } from '../tools/registry';
import { registerBuiltins } from '../tools/builtins/index';
import { chatWithToolLoop } from '../tools/executor';
import type { TeamConfig, TeamRunResult } from './team-config';
import { TaskList } from './task-list';
import { synthesizeResults } from './synthesizer';

const BUILTIN_TOOLS = new Set(['read_file', 'write_file', 'edit_file', 'run_command']);

/**
 * Create a scoped ToolRegistry containing only the tools a role is allowed to use.
 */
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

export async function runTeam(
  teamConfig: TeamConfig,
  task: string,
  userConfig: EngramConfig,
): Promise<TeamRunResult> {
  const runId = randomUUID().slice(0, 12);
  const startedAt = new Date().toISOString();
  const maxParallel = teamConfig.orchestrator?.max_parallel ?? 3;

  // Create task list with one task per role
  const taskList = new TaskList();
  for (const role of teamConfig.roles) {
    taskList.addTask(role.name, task);
  }

  const roleOutputs = new Map<string, string>();
  const running = new Set<string>();

  // Process roles with concurrency limit
  async function processRole(roleName: string): Promise<void> {
    const role = teamConfig.roles.find(r => r.name === roleName);
    if (!role) return;

    const taskItem = taskList.claimNext(roleName);
    if (!taskItem) return;

    try {
      const registry = createScopedRegistry(role.tools);
      const providerId = userConfig.provider.id;
      const modelId = role.model ?? userConfig.provider.model;

      const provider = getToolProvider(providerId);

      // Build role system prompt
      let systemPrompt = role.system_prompt;
      if (role.anti_scope) {
        systemPrompt += `\n\nIMPORTANT BOUNDARY: ${role.anti_scope}`;
      }

      const stream = chatWithToolLoop({
        provider,
        config: {
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Task: ${task}` },
          ],
          apiKey: userConfig.provider.apiKey,
          baseUrl: userConfig.provider.baseUrl,
        },
        registry,
        autonomyLevel: role.autonomy ?? 'ACT_SAFE',
      });

      let output = '';
      for await (const event of stream) {
        if (event.type === 'text') output += event.text;
      }

      taskList.complete(taskItem.id, output);
      roleOutputs.set(roleName, output);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      taskList.fail(taskItem.id, errorMsg);
      roleOutputs.set(roleName, `[Error: ${errorMsg}]`);
    }
  }

  // Run roles with concurrency semaphore
  const roleQueue = teamConfig.roles.map(r => r.name);
  const promises: Promise<void>[] = [];

  while (roleQueue.length > 0 || running.size > 0) {
    // Fill up to max_parallel
    while (roleQueue.length > 0 && running.size < maxParallel) {
      const roleName = roleQueue.shift()!;
      running.add(roleName);
      const promise = processRole(roleName).finally(() => running.delete(roleName));
      promises.push(promise);
    }

    // Wait for at least one to finish before filling again
    if (running.size >= maxParallel || (roleQueue.length === 0 && running.size > 0)) {
      await Promise.race(promises.filter(() => true));
      // Brief yield to let completions register
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  await Promise.allSettled(promises);

  // Synthesize results
  let synthesis: string;
  if (roleOutputs.size > 1) {
    synthesis = await synthesizeResults(task, roleOutputs, userConfig);
  } else {
    synthesis = roleOutputs.values().next().value ?? '';
  }

  return {
    id: runId,
    task,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    role_outputs: roleOutputs,
    synthesis,
  };
}
