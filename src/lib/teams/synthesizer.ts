/**
 * Result Synthesizer
 *
 * Takes all role outputs from a team run and produces
 * a consolidated report with synthesis, conflicts, and confidence.
 */

import type { EngramConfig } from '../config';
import { getProvider } from '../providers/index';

export async function synthesizeResults(
  task: string,
  roleOutputs: Map<string, string>,
  config: EngramConfig,
): Promise<string> {
  // Build synthesis prompt
  let prompt = `You are synthesizing the results of a multi-agent team that worked on the following task:\n\n**Task:** ${task}\n\n`;
  prompt += `The following agents produced these outputs:\n\n`;

  for (const [role, output] of roleOutputs) {
    prompt += `---\n### ${role}\n${output}\n\n`;
  }

  prompt += `---\n\nPlease synthesize these results into a single consolidated report. Include:\n`;
  prompt += `1. Key findings from each agent\n`;
  prompt += `2. Any conflicts or disagreements between agents\n`;
  prompt += `3. An overall confidence assessment\n`;
  prompt += `4. Recommended next steps\n`;

  try {
    const provider = getProvider(config.provider.id);
    const stream = provider.chat({
      model: config.provider.model,
      messages: [
        { role: 'system', content: 'You are a synthesis agent. Consolidate multiple agent outputs into clear, actionable reports.' },
        { role: 'user', content: prompt },
      ],
      apiKey: config.provider.apiKey,
      baseUrl: config.provider.baseUrl,
      maxTokens: 4096,
    });

    let result = '';
    for await (const token of stream) {
      result += token;
    }
    return result;
  } catch {
    // Fallback: concatenate outputs
    let fallback = `# Team Results: ${task}\n\n`;
    for (const [role, output] of roleOutputs) {
      fallback += `## ${role}\n${output}\n\n`;
    }
    return fallback;
  }
}
