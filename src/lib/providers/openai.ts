import type { ChatProvider, ChatConfig, Model } from './types';

const KNOWN_MODELS: Model[] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o3-mini', name: 'o3-mini' },
];

export const openai: ChatProvider = {
  id: 'openai',
  name: 'OpenAI',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.openai.com',

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.status !== 401;
    } catch {
      return true;
    }
  },

  async listModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) return KNOWN_MODELS;

    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return KNOWN_MODELS;

      const data = await res.json() as { data: Array<{ id: string }> };
      const chatModels = data.data
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o3') || m.id.startsWith('o1'))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => ({ id: m.id, name: m.id }));

      return chatModels.length > 0 ? chatModels : KNOWN_MODELS;
    } catch {
      return KNOWN_MODELS;
    }
  },

  async *chat(config: ChatConfig): AsyncGenerator<string> {
    const res = await fetch(
      `${config.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          max_tokens: config.maxTokens ?? 4096,
          messages: config.messages.map(m => ({ role: m.role, content: m.content })),
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
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
