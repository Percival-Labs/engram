import * as readline from 'readline';
import { hasConfig, loadConfig } from '../lib/config';
import { getProvider, getAllProviders, getToolProvider } from '../lib/providers/index';
import type { ChatMessage, ChatMessageExtended, ToolChatProvider } from '../lib/providers/types';
import { buildSystemPrompt } from '../lib/system-prompt';
import { createConversation, saveConversation, listConversations } from '../lib/conversation';
import {
  printWelcome,
  printUserPrompt,
  printAssistantHeader,
  renderStreamingResponse,
  renderToolStreamingResponse,
  printToolCall,
  printToolResult,
  printHelp,
  printConfig,
  printHistory,
  printError,
  printGoodbye,
  printRoutingInfo,
} from '../lib/chat-renderer';
import { setup } from './setup';
import { EngramRouter, loadRoutingConfig } from '../lib/router/index';
import { ToolRegistry } from '../lib/tools/registry';
import { registerBuiltins } from '../lib/tools/builtins/index';
import { loadCustomTools } from '../lib/tools/loader';
import { chatWithToolLoop } from '../lib/tools/executor';
import type { AutonomyLevel } from '../lib/team-types';

interface ChatOptions {
  provider?: string;
  model?: string;
}

export async function chat(options: ChatOptions = {}): Promise<void> {
  // First-run detection — no config means run wizard
  if (!hasConfig()) {
    console.log('');
    console.log('  Welcome to Engram! Let\'s set up your AI.\n');
    await setup();
    // After setup, check if config now exists
    if (!hasConfig()) {
      console.log('  Setup cancelled. Run `engram` again when ready.\n');
      return;
    }
  }

  const config = loadConfig();
  const providerId = options.provider ?? config.provider.id;
  const modelId = options.model ?? config.provider.model;

  let provider;
  try {
    provider = getProvider(providerId);
  } catch (err) {
    printError(`Unknown provider: ${providerId}`);
    return;
  }

  // Build system prompt from infrastructure files
  const systemPrompt = buildSystemPrompt(config);

  // Create conversation
  let conversation = createConversation(providerId, modelId);
  const messages: ChatMessageExtended[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Initialize router (pass API keys so provider-router can access them)
  const routingConfig = loadRoutingConfig();
  const apiKeys: Record<string, string> = {};
  if (config.provider.apiKey) apiKeys[providerId] = config.provider.apiKey;
  if (config.routing?.openrouterApiKey) apiKeys['openrouter'] = config.routing.openrouterApiKey;
  const router = new EngramRouter(routingConfig, getAllProviders(), apiKeys);

  // Initialize tool registry
  const toolRegistry = new ToolRegistry();
  registerBuiltins(toolRegistry);
  try {
    const customTools = await loadCustomTools();
    for (const tool of customTools) {
      toolRegistry.register(tool);
    }
  } catch {
    // Custom tool loading is best-effort
  }

  // Get tool-capable provider (if supported)
  let toolProvider: ToolChatProvider | null = null;
  try {
    toolProvider = getToolProvider(providerId);
  } catch {
    // Provider doesn't support tools — chat will fall back to plain text
  }

  // Determine autonomy level from config
  const autonomyLevel: AutonomyLevel = config.autonomy_level ?? 'ACT_SAFE';

  printWelcome(config.aiName, modelId, provider.name);

  // Readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Handle Ctrl+C gracefully
  let exiting = false;
  rl.on('close', () => {
    if (!exiting) {
      exiting = true;
      if (conversation.messages.length > 0) {
        saveConversation(conversation);
      }
      printGoodbye(config.aiName);
      process.exit(0);
    }
  });

  const askQuestion = (): void => {
    printUserPrompt(config.userName);

    let inputBuffer = '';
    let multiline = false;

    const processLine = (line: string): void => {
      // Handle multiline continuation
      if (line.endsWith('\\')) {
        inputBuffer += line.slice(0, -1) + '\n';
        multiline = true;
        process.stdout.write('  ... ');
        return;
      }

      inputBuffer += line;
      multiline = false;
      const input = inputBuffer.trim();
      inputBuffer = '';

      if (!input) {
        askQuestion();
        return;
      }

      // Handle slash commands
      if (input.startsWith('/')) {
        handleCommand(input, config, conversation, modelId).then((result) => {
          if (result === 'quit') {
            exiting = true;
            if (conversation.messages.length > 0) {
              saveConversation(conversation);
            }
            printGoodbye(config.aiName);
            rl.close();
            process.exit(0);
          }
          if (result === 'new') {
            if (conversation.messages.length > 0) {
              saveConversation(conversation);
            }
            conversation = createConversation(providerId, modelId);
            messages.length = 1; // Keep system prompt
            console.log('  \x1b[90mNew conversation started.\x1b[0m\n');
          }
          askQuestion();
        });
        return;
      }

      // Add user message
      messages.push({ role: 'user', content: input });
      conversation.messages.push({ role: 'user', content: input });

      // Get AI response
      printAssistantHeader(config.aiName);

      (async () => {
        try {
          let fullResponse: string;

          if (toolProvider && !routingConfig.enabled) {
            // Tool-enabled chat loop
            const toolConfig = {
              model: modelId,
              messages: [...messages],
              apiKey: config.provider.apiKey,
              baseUrl: config.provider.baseUrl,
            };

            const stream = chatWithToolLoop({
              provider: toolProvider,
              config: toolConfig,
              registry: toolRegistry,
              autonomyLevel,
              onToolCall: (name, toolInput) => printToolCall(name, toolInput),
              onToolResult: (name, result, isError) => {
                printToolResult(name, result, isError);
                // Re-print header for continued response
                printAssistantHeader(config.aiName);
              },
            });
            fullResponse = await renderToolStreamingResponse(stream);
          } else {
            // Plain text chat (routing or no tool support)
            const chatConfig = {
              model: modelId,
              messages: messages.map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              })),
              apiKey: config.provider.apiKey,
              baseUrl: config.provider.baseUrl,
            };

            const stream = routingConfig.enabled
              ? router.chat(chatConfig)
              : provider.chat(chatConfig);
            fullResponse = await renderStreamingResponse(stream);

            // Show routing info if routing is active
            if (routingConfig.enabled) {
              const info = router.getLastRoutingInfo();
              if (info) printRoutingInfo(info);
            }
          }

          messages.push({ role: 'assistant', content: fullResponse });
          conversation.messages.push({ role: 'assistant', content: fullResponse });

          // Auto-save every exchange
          saveConversation(conversation);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          printError(message);
        }

        askQuestion();
      })();
    };

    rl.once('line', processLine);
  };

  askQuestion();
}

async function handleCommand(
  input: string,
  config: ReturnType<typeof loadConfig>,
  conversation: ReturnType<typeof createConversation>,
  modelId: string,
): Promise<string | void> {
  const cmd = input.split(' ')[0].toLowerCase();

  switch (cmd) {
    case '/quit':
    case '/exit':
    case '/q':
      return 'quit';

    case '/new':
      return 'new';

    case '/help':
    case '/h':
      printHelp();
      break;

    case '/config':
      printConfig({
        aiName: config.aiName,
        userName: config.userName,
        provider: config.provider.id,
        model: modelId,
        personality: config.personality,
      });
      break;

    case '/history':
      printHistory(listConversations());
      break;

    case '/model':
      console.log(`\n  \x1b[90mCurrent model: ${modelId}\x1b[0m`);
      console.log(`  \x1b[90mTo change, restart with: engram chat --model <name>\x1b[0m\n`);
      break;

    case '/usage': {
      const { printUsageSummary } = await import('./usage');
      printUsageSummary();
      break;
    }

    case '/routing':
    case '/router': {
      const rc = loadRoutingConfig();
      console.log(`\n  \x1b[90mRouting: ${rc.enabled ? '\x1b[32menabled' : '\x1b[33mdisabled'}\x1b[0m`);
      console.log(`  \x1b[90mStrategy: ${rc.strategy}\x1b[0m`);
      console.log(`  \x1b[90mCascade: ${rc.cascade.enabled ? 'on' : 'off'}\x1b[0m`);
      console.log(`  \x1b[90mBudget: ${rc.budgetGuard.dailyLimitCents > 0 ? `$${(rc.budgetGuard.dailyLimitCents / 100).toFixed(2)}/day` : 'unlimited'}\x1b[0m\n`);
      break;
    }

    default:
      console.log(`\n  \x1b[33mUnknown command: ${cmd}\x1b[0m`);
      printHelp();
      break;
  }
}
