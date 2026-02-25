import type { ChatProvider } from './types';
import { anthropic } from './anthropic';
import { openai } from './openai';
import { ollama } from './ollama';

export type { ChatProvider, Model, ChatMessage, ChatConfig } from './types';

const providers: Record<string, ChatProvider> = {
  anthropic,
  openai,
  ollama,
};

export function getProvider(id: string): ChatProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Unknown provider: ${id}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

export function listProviders(): ChatProvider[] {
  return Object.values(providers);
}
