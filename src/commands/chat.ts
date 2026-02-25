import * as readline from 'readline';
import { hasConfig, loadConfig } from '../lib/config';
import { getProvider } from '../lib/providers/index';
import type { ChatMessage } from '../lib/providers/types';
import { buildSystemPrompt } from '../lib/system-prompt';
import { createConversation, saveConversation, listConversations } from '../lib/conversation';
import {
  printWelcome,
  printUserPrompt,
  printAssistantHeader,
  renderStreamingResponse,
  printHelp,
  printConfig,
  printHistory,
  printError,
  printGoodbye,
} from '../lib/chat-renderer';
import { setup } from './setup';

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
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

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

      const chatConfig = {
        model: modelId,
        messages: [...messages],
        apiKey: config.provider.apiKey,
        baseUrl: config.provider.baseUrl,
      };

      (async () => {
        try {
          const stream = provider.chat(chatConfig);
          const fullResponse = await renderStreamingResponse(stream);

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

    default:
      console.log(`\n  \x1b[33mUnknown command: ${cmd}\x1b[0m`);
      printHelp();
      break;
  }
}
