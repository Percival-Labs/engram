import type { ChatProvider, ToolChatProvider } from './types';
import { anthropic } from './anthropic';
import { openai } from './openai';
import { ollama } from './ollama';
import { openrouter } from './openrouter';
import { percival } from './percival';

export type { ChatProvider, Model, ChatMessage, ChatConfig } from './types';
export type {
  ToolChatProvider,
  ChatConfigExtended,
  ChatStreamEvent,
  ChatMessageExtended,
  ToolDefinition,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
} from './types';

const providers: Record<string, ChatProvider> = {
  anthropic,
  openai,
  ollama,
  openrouter,
  percival,
};

export function getProvider(id: string): ChatProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Unknown provider: ${id}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

export function getToolProvider(id: string): ToolChatProvider {
  const provider = getProvider(id);
  if (!('chatWithTools' in provider) || typeof (provider as ToolChatProvider).chatWithTools !== 'function') {
    throw new Error(`Provider "${id}" does not support tool use. Available tool providers: anthropic, openai, ollama, openrouter`);
  }
  return provider as ToolChatProvider;
}

export function getAllProviders(): Record<string, ChatProvider> {
  return { ...providers };
}

export function listProviders(): ChatProvider[] {
  return Object.values(providers);
}
