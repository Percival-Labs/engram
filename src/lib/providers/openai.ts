import type {
  ChatProvider,
  ChatConfig,
  Model,
  ToolChatProvider,
  ChatConfigExtended,
  ChatStreamEvent,
  ChatMessageExtended,
  ContentBlock,
} from './types';

const KNOWN_MODELS: Model[] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o3-mini', name: 'o3-mini' },
];

export const openai: ToolChatProvider = {
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

  async *chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent> {
    // Convert ToolDefinition[] to OpenAI function format
    const tools = config.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    // Convert ChatMessageExtended[] to OpenAI message format
    const messages: Array<Record<string, unknown>> = [];
    for (const msg of config.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // Assistant with tool_use blocks -> OpenAI tool_calls format
        const textParts = (msg.content as ContentBlock[]).filter(b => b.type === 'text');
        const toolParts = (msg.content as ContentBlock[]).filter(b => b.type === 'tool_use');
        const content = textParts.map(b => (b as { text: string }).text).join('') || null;
        const toolCalls = toolParts.map(b => {
          const tb = b as { id: string; name: string; input: Record<string, unknown> };
          return {
            id: tb.id,
            type: 'function',
            function: { name: tb.name, arguments: JSON.stringify(tb.input) },
          };
        });
        messages.push({
          role: 'assistant',
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      } else if (msg.role === 'tool' && Array.isArray(msg.content)) {
        // Tool results -> one message per result
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content,
            });
          }
        }
      } else {
        messages.push({
          role: msg.role === 'tool' ? 'user' : msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    const body: Record<string, unknown> = {
      model: config.model,
      stream: true,
      max_tokens: config.maxTokens ?? 4096,
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const res = await fetch(
      `${config.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Buffer tool calls by index
    const toolCallBuffers: Map<number, { id: string; name: string; arguments: string }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          // Emit any remaining buffered tool calls
          for (const [, tc] of toolCallBuffers) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }
            yield { type: 'tool_use', id: tc.id, name: tc.name, input };
          }
          toolCallBuffers.clear();
          yield { type: 'message_end' };
          return;
        }

        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta;
          const finishReason = event.choices?.[0]?.finish_reason;

          // Text content
          if (delta?.content) {
            yield { type: 'text', text: delta.content };
          }

          // Tool call deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls as Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>) {
              const idx = tc.index;
              if (!toolCallBuffers.has(idx)) {
                toolCallBuffers.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
              }
              const buf = toolCallBuffers.get(idx)!;
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.function?.arguments) buf.arguments += tc.function.arguments;
            }
          }

          // On finish, emit buffered tool calls
          if (finishReason === 'tool_calls' || finishReason === 'stop') {
            for (const [, tc] of toolCallBuffers) {
              let input: Record<string, unknown> = {};
              try { input = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }
              yield { type: 'tool_use', id: tc.id, name: tc.name, input };
            }
            toolCallBuffers.clear();
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Final safety: emit any remaining and end
    for (const [, tc] of toolCallBuffers) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }
      yield { type: 'tool_use', id: tc.id, name: tc.name, input };
    }
    yield { type: 'message_end' };
  },
};
