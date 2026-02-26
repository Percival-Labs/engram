// ── OpenRouter Provider ──────────────────────────────────────────
// OpenRouter uses an OpenAI-compatible API. Provides access to
// 100+ models from multiple providers through a single API key.
// https://openrouter.ai/docs

import type { ChatProvider, ChatConfig, Model } from './types';

const KNOWN_MODELS: Model[] = [
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
];

const BASE_URL = 'https://openrouter.ai/api/v1';

export const openrouter: ChatProvider = {
  id: 'openrouter',
  name: 'OpenRouter',
  requiresApiKey: true,
  defaultBaseUrl: BASE_URL,

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/auth/key`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    } catch {
      return true; // Network error — don't block setup
    }
  },

  async listModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) return KNOWN_MODELS;

    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return KNOWN_MODELS;

      const data = await res.json() as { data: Array<{ id: string; name: string }> };
      const models = data.data
        .slice(0, 50) // Limit to top 50 to avoid overwhelming
        .map(m => ({ id: m.id, name: m.name || m.id }));

      return models.length > 0 ? models : KNOWN_MODELS;
    } catch {
      return KNOWN_MODELS;
    }
  },

  async *chat(config: ChatConfig): AsyncGenerator<string> {
    const baseUrl = config.baseUrl ?? BASE_URL;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://engram.dev',
        'X-Title': 'Engram',
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        max_tokens: config.maxTokens ?? 4096,
        messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const event = JSON.parse(data);
          const content = event.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  },
};
