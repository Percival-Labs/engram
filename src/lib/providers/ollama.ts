import type {
  ChatProvider,
  ChatConfig,
  Model,
  ToolChatProvider,
  ChatConfigExtended,
  ChatStreamEvent,
  ContentBlock,
} from './types';

export const ollama: ToolChatProvider = {
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

  async *chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent> {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';

    // Convert ToolDefinition[] to Ollama format
    const tools = config.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    // Convert messages to Ollama format
    const messages: Array<Record<string, unknown>> = [];
    for (const msg of config.messages) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        // Tool results: Ollama expects role: 'tool' with content string
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === 'tool_result') {
            messages.push({ role: 'tool', content: block.content });
          }
        }
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const textParts = (msg.content as ContentBlock[])
          .filter(b => b.type === 'text')
          .map(b => (b as { text: string }).text)
          .join('');
        const toolCalls = (msg.content as ContentBlock[])
          .filter(b => b.type === 'tool_use')
          .map(b => {
            const tb = b as { name: string; input: Record<string, unknown> };
            return { function: { name: tb.name, arguments: tb.input } };
          });
        messages.push({
          role: 'assistant',
          content: textParts || '',
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      } else {
        messages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    // Use non-streaming when tools are present for reliable tool detection
    const hasTools = tools && tools.length > 0;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          stream: !hasTools, // Non-streaming for tool calls
          messages,
          ...(hasTools ? { tools } : {}),
        }),
      });
    } catch {
      throw new Error(
        'Could not connect to Ollama. Is it running? Start it with: ollama serve'
      );
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err}`);
    }

    if (hasTools) {
      // Non-streaming: parse complete response
      const data = await res.json() as {
        message?: {
          content?: string;
          tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
          }>;
        };
      };

      // Yield text content if present
      if (data.message?.content) {
        yield { type: 'text', text: data.message.content };
      }

      // Yield tool calls if present
      if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
        for (const tc of data.message.tool_calls) {
          yield {
            type: 'tool_use',
            id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: tc.function.name,
            input: tc.function.arguments ?? {},
          };
        }
      }

      yield { type: 'message_end' };
    } else {
      // Streaming fallback (no tools) — same as chat() but yielding ChatStreamEvent
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
              yield { type: 'text', text: event.message.content };
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      yield { type: 'message_end' };
    }
  },
};
