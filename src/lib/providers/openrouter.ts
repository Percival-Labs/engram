// ── OpenRouter Provider ──────────────────────────────────────────
// OpenRouter uses an OpenAI-compatible API. Provides access to
// 100+ models from multiple providers through a single API key.
// https://openrouter.ai/docs

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
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large' },
];

const BASE_URL = 'https://openrouter.ai/api/v1';

export const openrouter: ToolChatProvider = {
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

  async *chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent> {
    const baseUrl = config.baseUrl ?? BASE_URL;

    // Convert ToolDefinition[] to OpenAI function format
    const tools = config.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    // Convert ChatMessageExtended[] to OpenAI-compatible message format
    const messages: Array<Record<string, unknown>> = [];
    for (const msg of config.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
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

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://engram.dev',
        'X-Title': 'Engram',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${err}`);
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

          if (delta?.content) {
            yield { type: 'text', text: delta.content };
          }

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

    for (const [, tc] of toolCallBuffers) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }
      yield { type: 'tool_use', id: tc.id, name: tc.name, input };
    }
    yield { type: 'message_end' };
  },
};
