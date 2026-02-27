/**
 * Agent Generate Command
 *
 * engram agent generate <description>
 *
 * Uses a meta-agent to generate team/chain configs from a natural language description.
 */

import { loadConfig } from '../lib/config';
import { getToolProvider } from '../lib/providers/index';
import { ToolRegistry } from '../lib/tools/registry';
import { registerBuiltins } from '../lib/tools/builtins/index';
import { registerMetaTools } from '../lib/meta/tools';
import { buildMetaAgentPrompt } from '../lib/meta/system-prompt';
import { chatWithToolLoop } from '../lib/tools/executor';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

export async function agentGenerate(description: string): Promise<void> {
  const config = loadConfig();

  console.log('');
  console.log(`  ${BOLD}Agent Generator${RESET}`);
  console.log(`  ${DIM}────────────────────────────────${RESET}`);
  console.log(`  ${DIM}Description:${RESET} ${description}`);
  console.log('');

  // Build registry with builtins + meta tools + read_file for inspection
  const registry = new ToolRegistry();
  registerBuiltins(registry);
  registerMetaTools(registry);

  let provider;
  try {
    provider = getToolProvider(config.provider.id);
  } catch (err) {
    console.log(`  ${YELLOW}${BOLD}Error:${RESET} ${err instanceof Error ? err.message : err}\n`);
    return;
  }

  const systemPrompt = buildMetaAgentPrompt();

  console.log(`  ${DIM}Generating configuration...${RESET}\n`);

  try {
    const stream = chatWithToolLoop({
      provider,
      config: {
        model: config.provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate an agent configuration for: ${description}` },
        ],
        apiKey: config.provider.apiKey,
        baseUrl: config.provider.baseUrl,
      },
      registry,
      autonomyLevel: 'ACT_SAFE',
      onToolCall: (name, input) => {
        console.log(`  ${MAGENTA}⚙ ${name}${RESET}`);
        if ('name' in input) {
          console.log(`    ${DIM}Creating: ${input.name}${RESET}`);
        }
      },
      onToolResult: (name, result, isError) => {
        const icon = isError ? `${YELLOW}✗` : `${GREEN}✓`;
        console.log(`  ${icon} ${name}${RESET}: ${isError ? result : 'Done'}${RESET}`);
      },
    });

    let output = '';
    for await (const event of stream) {
      if (event.type === 'text') {
        output += event.text;
        process.stdout.write(event.text);
      }
    }
    console.log('\n');

    if (!output && !stream) {
      console.log(`  ${YELLOW}No output generated.${RESET}\n`);
    }
  } catch (err) {
    console.log(`\n  ${YELLOW}${BOLD}Error:${RESET} ${err instanceof Error ? err.message : err}\n`);
  }
}
