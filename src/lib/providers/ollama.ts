import type { ChatProvider, ChatConfig, Model } from './types';

export const ollama: ChatProvider = {
  id: 'ollama',
  name: 'Ollama (Local)',
  requiresApiKey: false,
  defaultBaseUrl: 'http://localhost:11434',

  async validateKey(): Promise<boolean> {
    // No key needed — just check if Ollama is running
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(): Promise<Model[]> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (!res.ok) return [];

      const data = await res.json() as { models: Array<{ name: string }> };
      return (data.models || []).map(m => ({
        id: m.name,
        name: m.name,
      }));
    } catch {
      return [];
    }
  },

  async *chat(config: ChatConfig): AsyncGenerator<string> {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: config.messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
    } catch (err) {
      throw new Error(
        'Could not connect to Ollama. Is it running? Start it with: ollama serve'
      );
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err}`);
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
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.message?.content) {
            yield event.message.content;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  },
};
