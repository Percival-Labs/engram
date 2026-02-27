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

const MODELS: Model[] = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude 4.5 Sonnet' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
];

export const anthropic: ToolChatProvider = {
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

  async *chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent> {
    const systemMessage = config.messages.find(m => m.role === 'system');
    const nonSystemMessages = config.messages.filter(m => m.role !== 'system');

    // Convert ChatMessageExtended[] to Anthropic message format
    const messages: Array<Record<string, unknown>> = [];
    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        // Tool results go as user messages with tool_result content blocks
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        const content = blocks
          .filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result')
          .map(b => ({
            type: 'tool_result' as const,
            tool_use_id: b.tool_use_id,
            content: b.content,
            ...(b.is_error ? { is_error: true } : {}),
          }));
        messages.push({ role: 'user', content });
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // Assistant messages with ContentBlock[] map directly
        const content = (msg.content as ContentBlock[]).map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
          return b;
        });
        messages.push({ role: 'assistant', content });
      } else {
        // String content (user or assistant)
        messages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
      }
    }

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      stream: true,
      messages,
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : JSON.stringify(systemMessage.content);
    }

    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
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

    // Track active tool_use blocks by index
    let activeToolId = '';
    let activeToolName = '';
    let activeToolInput = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { type: 'message_end' };
          return;
        }

        try {
          const event = JSON.parse(data);

          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              activeToolId = event.content_block.id;
              activeToolName = event.content_block.name;
              activeToolInput = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              yield { type: 'text', text: event.delta.text };
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json !== undefined) {
              activeToolInput += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            // If we were accumulating a tool_use block, emit it now
            if (activeToolId) {
              let input: Record<string, unknown> = {};
              try {
                if (activeToolInput) {
                  input = JSON.parse(activeToolInput);
                }
              } catch {
                // Malformed tool input — emit empty
              }
              yield { type: 'tool_use', id: activeToolId, name: activeToolName, input };
              activeToolId = '';
              activeToolName = '';
              activeToolInput = '';
            }
          } else if (event.type === 'message_stop') {
            yield { type: 'message_end' };
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    yield { type: 'message_end' };
  },
};
