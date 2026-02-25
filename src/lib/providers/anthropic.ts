import type { ChatProvider, ChatConfig, Model } from './types';

const MODELS: Model[] = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude 4.5 Sonnet' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
];

export const anthropic: ChatProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.anthropic.com',

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // 200 = valid key, 401 = invalid, anything else = network issue (treat as valid)
      if (res.status === 401) return false;
      return true;
    } catch {
      // Network error — can't validate, assume good
      return true;
    }
  },

  async listModels(): Promise<Model[]> {
    return MODELS;
  },

  async *chat(config: ChatConfig): AsyncGenerator<string> {
    const systemMessage = config.messages.find(m => m.role === 'system');
    const userMessages = config.messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      stream: true,
      messages: userMessages.map(m => ({ role: m.role, content: m.content })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const res = await fetch(
      `${config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
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
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  },
};
