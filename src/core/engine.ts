/**
 * Engram Core Engine
 *
 * Headless chat engine — no readline, no ANSI, no terminal assumptions.
 * Both CLI and Desktop app consume this via structured events.
 */

import { hasConfig, loadConfig, type EngramConfig } from '../lib/config';
import { getProvider, getAllProviders, getToolProvider } from '../lib/providers/index';
import type { ChatMessageExtended, ToolChatProvider } from '../lib/providers/types';
import { buildSystemPrompt } from '../lib/system-prompt';
import { createConversation, saveConversation, listConversations, type Conversation } from '../lib/conversation';
import { EngramRouter, loadRoutingConfig } from '../lib/router/index';
import type { RoutingConfig } from '../lib/router/types';
import { ToolRegistry } from '../lib/tools/registry';
import { registerBuiltins } from '../lib/tools/builtins/index';
import { loadCustomTools } from '../lib/tools/loader';
import { chatWithToolLoop } from '../lib/tools/executor';
import type { AutonomyLevel } from '../lib/team-types';
import type { EngineEvent, CommandResult, ConversationInfo } from './types';

export interface EngramEngineOptions {
  provider?: string;
  model?: string;
  config?: EngramConfig;
}

export class EngramEngine {
  private config: EngramConfig;
  private providerId: string;
  private modelId: string;
  private messages: ChatMessageExtended[] = [];
  private conversation: Conversation;
  private router: EngramRouter;
  private routingConfig: RoutingConfig;
  private toolRegistry: ToolRegistry;
  private toolProvider: ToolChatProvider | null = null;
  private autonomyLevel: AutonomyLevel;

  private constructor(config: EngramConfig, options: EngramEngineOptions = {}) {
    this.config = config;
    this.providerId = options.provider ?? config.provider.id;
    this.modelId = options.model ?? config.provider.model;

    // Build system prompt and init conversation
    const systemPrompt = buildSystemPrompt(config);
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.conversation = createConversation(this.providerId, this.modelId);

    // Initialize router
    this.routingConfig = loadRoutingConfig();
    const apiKeys: Record<string, string> = {};
    if (config.provider.apiKey) apiKeys[this.providerId] = config.provider.apiKey;
    if (config.routing?.openrouterApiKey) apiKeys['openrouter'] = config.routing.openrouterApiKey;
    this.router = new EngramRouter(this.routingConfig, getAllProviders(), apiKeys);

    // Initialize tool registry
    this.toolRegistry = new ToolRegistry();
    registerBuiltins(this.toolRegistry);

    // Get tool-capable provider
    try {
      this.toolProvider = getToolProvider(this.providerId);
    } catch {
      this.toolProvider = null;
    }

    this.autonomyLevel = (config.autonomy_level ?? 'ACT_SAFE') as AutonomyLevel;
  }

  /**
   * Create and initialize an EngramEngine instance.
   * Loads config from disk if not provided.
   */
  static async create(options: EngramEngineOptions = {}): Promise<EngramEngine> {
    const config = options.config ?? loadConfig();
    const engine = new EngramEngine(config, options);

    // Load custom tools (best-effort)
    try {
      const customTools = await loadCustomTools();
      for (const tool of customTools) {
        engine.toolRegistry.register(tool);
      }
    } catch {
      // Custom tool loading is best-effort
    }

    return engine;
  }

  /**
   * Check if Engram is configured (first-run detection).
   */
  static isConfigured(): boolean {
    return hasConfig();
  }

  /**
   * Send a message and receive structured events.
   * No terminal rendering — caller decides how to display.
   */
  async *chat(message: string): AsyncGenerator<EngineEvent> {
    // Add user message
    this.messages.push({ role: 'user', content: message });
    this.conversation.messages.push({ role: 'user', content: message });

    try {
      let fullResponse = '';

      if (this.toolProvider && !this.routingConfig.enabled) {
        // Tool-enabled chat loop
        const toolConfig = {
          model: this.modelId,
          messages: [...this.messages],
          apiKey: this.config.provider.apiKey,
          baseUrl: this.config.provider.baseUrl,
        };

        const stream = chatWithToolLoop({
          provider: this.toolProvider,
          config: toolConfig,
          registry: this.toolRegistry,
          autonomyLevel: this.autonomyLevel,
          onToolCall: (name, input) => {
            // Tool calls are yielded as events below
          },
          onToolResult: (name, result, isError) => {
            // Tool results are yielded as events below
          },
        });

        for await (const event of stream) {
          if (event.type === 'text') {
            fullResponse += event.text;
            yield { type: 'text', content: event.text };
          } else if (event.type === 'tool_use') {
            yield { type: 'tool_call', name: event.name, input: event.input };
          }
        }

        // Check for tool results in messages added by the executor
        // The executor appends tool results to the messages array internally
      } else {
        // Plain text chat (routing or no tool support)
        const chatConfig = {
          model: this.modelId,
          messages: this.messages.map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          })),
          apiKey: this.config.provider.apiKey,
          baseUrl: this.config.provider.baseUrl,
        };

        const stream = this.routingConfig.enabled
          ? this.router.chat(chatConfig)
          : getProvider(this.providerId).chat(chatConfig);

        for await (const token of stream) {
          fullResponse += token;
          yield { type: 'text', content: token };
        }

        // Routing info
        if (this.routingConfig.enabled) {
          const info = this.router.getLastRoutingInfo();
          if (info) {
            yield {
              type: 'routing_info',
              model: info.model,
              provider: info.provider,
              cost: info.costCents,
            };
          }
        }
      }

      // Store response
      this.messages.push({ role: 'assistant', content: fullResponse });
      this.conversation.messages.push({ role: 'assistant', content: fullResponse });
      saveConversation(this.conversation);

      yield { type: 'done', fullResponse };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', message };
    }
  }

  /**
   * Handle a slash command programmatically.
   */
  async handleCommand(command: string): Promise<CommandResult> {
    const cmd = command.split(' ')[0].toLowerCase();

    switch (cmd) {
      case '/quit':
      case '/exit':
      case '/q':
        if (this.conversation.messages.length > 0) {
          saveConversation(this.conversation);
        }
        return { action: 'quit' };

      case '/new':
        if (this.conversation.messages.length > 0) {
          saveConversation(this.conversation);
        }
        this.conversation = createConversation(this.providerId, this.modelId);
        this.messages = [this.messages[0]]; // Keep system prompt
        return { action: 'new', message: 'New conversation started.' };

      case '/help':
        return {
          action: 'info',
          message: 'Commands: /quit, /new, /help, /config, /history, /model, /usage, /routing',
        };

      case '/config':
        return {
          action: 'info',
          data: {
            aiName: this.config.aiName,
            userName: this.config.userName,
            provider: this.providerId,
            model: this.modelId,
            personality: this.config.personality,
          },
        };

      case '/history':
        return {
          action: 'info',
          data: listConversations().map(c => ({
            id: c.id,
            title: c.title,
            messageCount: c.messages.length,
            updatedAt: c.updatedAt,
          })),
        };

      case '/model':
        return {
          action: 'info',
          message: `Current model: ${this.modelId}`,
        };

      case '/routing':
      case '/router':
        return {
          action: 'info',
          data: {
            enabled: this.routingConfig.enabled,
            strategy: this.routingConfig.strategy,
            cascade: this.routingConfig.cascade.enabled,
            budget: this.routingConfig.budgetGuard.dailyLimitCents,
          },
        };

      default:
        return {
          action: 'error',
          message: `Unknown command: ${cmd}`,
        };
    }
  }

  /**
   * Get current conversation.
   */
  getConversation(): Conversation {
    return this.conversation;
  }

  /**
   * Get the loaded config.
   */
  getConfig(): EngramConfig {
    return this.config;
  }

  /**
   * Get provider and model info.
   */
  getInfo(): { provider: string; model: string; aiName: string; userName: string } {
    return {
      provider: getProvider(this.providerId).name,
      model: this.modelId,
      aiName: this.config.aiName,
      userName: this.config.userName,
    };
  }

  /**
   * Clean shutdown — save conversation if needed.
   */
  shutdown(): void {
    if (this.conversation.messages.length > 0) {
      saveConversation(this.conversation);
    }
  }
}
