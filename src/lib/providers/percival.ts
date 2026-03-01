// ── Percival Gateway Provider ────────────────────────────────────
// Routes inference requests through the Vouch Gateway.
// Supports both transparent (NIP-98) and private (blind token) auth.
// Gateway handles upstream routing to Anthropic/OpenAI/OpenRouter.

import type {
  ChatProvider,
  ChatConfig,
  Model,
  ToolChatProvider,
  ChatConfigExtended,
  ChatStreamEvent,
  ContentBlock,
} from './types';
import { createNip98Auth, loadCreditConfig, checkSpendLimit, getSpendWarnings } from '../credits/index';

// ── Models ──────────────────────────────────────────────────────

// All models available through gateway — no gating by tier.
const MODELS: Model[] = [
  // Anthropic
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude 4.5 Sonnet' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o3-mini', name: 'O3 Mini' },
  // OpenRouter (subset — full list via API)
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
];

// ── Provider Routing ────────────────────────────────────────────

/**
 * Determine which upstream provider a model belongs to.
 * Used to construct the gateway path: /{provider}/v1/...
 */
function getProviderForModel(model: string): 'anthropic' | 'openai' | 'openrouter' {
  if (model.startsWith('claude') || model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  return 'openrouter';
}

/**
 * Get the provider API path for a model.
 */
function getApiPath(model: string): string {
  const provider = getProviderForModel(model);
  switch (provider) {
    case 'anthropic':
      return `/${provider}/v1/messages`;
    case 'openai':
      return `/${provider}/v1/chat/completions`;
    case 'openrouter':
      return `/${provider}/v1/chat/completions`;
  }
}

/**
 * Check if a model uses Anthropic's message format (vs OpenAI's).
 */
function isAnthropicModel(model: string): boolean {
  return getProviderForModel(model) === 'anthropic';
}

// ── URL Validation ──────────────────────────────────────────────

const TRUSTED_GATEWAY_HOSTS = [
  'gateway.percival-labs.ai',
  'vouch-gateway.percival-labs.workers.dev',
  'localhost',
];

/**
 * Validate a gateway URL before sending auth credentials.
 * Prevents leaking NIP-98 tokens to arbitrary hosts.
 */
function validateGatewayUrl(url: string): void {
  const parsed = new URL(url);
  // Enforce HTTPS (except localhost for dev)
  if (parsed.hostname !== 'localhost' && parsed.protocol !== 'https:') {
    throw new Error(`[percival] Gateway URL must use HTTPS: ${url}`);
  }
  // Verify the host is a trusted gateway
  if (!TRUSTED_GATEWAY_HOSTS.includes(parsed.hostname)) {
    throw new Error(`[percival] Untrusted gateway host: ${parsed.hostname}. Auth tokens will not be sent.`);
  }
}

// ── Auth Header ─────────────────────────────────────────────────

async function getAuthHeader(
  method: string,
  fullUrl: string,
): Promise<Record<string, string>> {
  // Validate the gateway URL before attaching any auth credentials
  validateGatewayUrl(fullUrl);

  const config = loadCreditConfig();

  if (config.mode === 'transparent') {
    const auth = await createNip98Auth(method, fullUrl);
    if (auth) {
      return { 'X-Vouch-Auth': auth };
    }
  }

  // Private mode or no identity — no auth header (gateway requires auth, will reject)
  return {};
}

// ── Streaming Helpers ───────────────────────────────────────────

async function* streamSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
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
      yield data;
    }
  }
}

// ── Provider Implementation ─────────────────────────────────────

export const percival: ToolChatProvider = {
  id: 'percival',
  name: 'Percival Labs Gateway',
  requiresApiKey: false, // Uses NIP-98 identity, not API key
  defaultBaseUrl: 'https://gateway.percival-labs.ai',

  async validateKey(): Promise<boolean> {
    // No API key needed — validate by checking gateway health
    const config = loadCreditConfig();
    try {
      const res = await fetch(`${config.gatewayUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(): Promise<Model[]> {
    return MODELS;
  },

  async *chat(config: ChatConfig): AsyncGenerator<string> {
    // Check spend limits (client-side)
    const warnings = getSpendWarnings();
    for (const w of warnings) {
      console.error(`[percival] Warning: ${w}`);
    }

    const limitCheck = checkSpendLimit(10); // Rough minimum cost estimate
    if (!limitCheck.allowed) {
      throw new Error(`[percival] ${limitCheck.reason}`);
    }

    const creditConfig = loadCreditConfig();
    const gatewayUrl = config.baseUrl ?? creditConfig.gatewayUrl;
    const apiPath = getApiPath(config.model);
    const fullUrl = `${gatewayUrl}${apiPath}`;

    const authHeaders = await getAuthHeader('POST', fullUrl);

    // Build request body based on provider
    let body: Record<string, unknown>;

    if (isAnthropicModel(config.model)) {
      // Anthropic format
      const systemMessage = config.messages.find(m => m.role === 'system');
      const userMessages = config.messages.filter(m => m.role !== 'system');

      body = {
        model: config.model,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
        messages: userMessages.map(m => ({ role: m.role, content: m.content })),
      };

      if (systemMessage) {
        body.system = systemMessage.content;
      }
    } else {
      // OpenAI format
      body = {
        model: config.model,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
        messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      };
    }

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gateway error (${res.status}): ${err}`);
    }

    // Log Vouch headers for transparency
    const vouchCost = res.headers.get('X-Vouch-Cost-Sats');
    const vouchModel = res.headers.get('X-Vouch-Model');
    const vouchTier = res.headers.get('X-Vouch-Tier');
    if (vouchCost) {
      console.error(`[percival] Model: ${vouchModel} | Tier: ${vouchTier} | Cost: ${vouchCost} sats`);
    }

    const reader = res.body!.getReader();

    if (isAnthropicModel(config.model)) {
      // Parse Anthropic SSE
      for await (const data of streamSSE(reader)) {
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    } else {
      // Parse OpenAI SSE
      for await (const data of streamSSE(reader)) {
        try {
          const event = JSON.parse(data);
          if (event.choices?.[0]?.delta?.content) {
            yield event.choices[0].delta.content;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  },

  async *chatWithTools(config: ChatConfigExtended): AsyncGenerator<ChatStreamEvent> {
    const creditConfig = loadCreditConfig();
    const gatewayUrl = config.baseUrl ?? creditConfig.gatewayUrl;
    const apiPath = getApiPath(config.model);
    const fullUrl = `${gatewayUrl}${apiPath}`;

    const authHeaders = await getAuthHeader('POST', fullUrl);

    let body: Record<string, unknown>;

    if (isAnthropicModel(config.model)) {
      // Anthropic format
      const systemMessage = config.messages.find(m => m.role === 'system');
      const nonSystemMessages = config.messages.filter(m => m.role !== 'system');

      const messages: Array<Record<string, unknown>> = [];
      for (const msg of nonSystemMessages) {
        if (msg.role === 'tool') {
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
          const content = (msg.content as ContentBlock[]).map(b => {
            if (b.type === 'text') return { type: 'text', text: b.text };
            if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
            return b;
          });
          messages.push({ role: 'assistant', content });
        } else {
          messages.push({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          });
        }
      }

      body = {
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
    } else {
      // OpenAI format
      const messages = config.messages.map(msg => {
        if (typeof msg.content === 'string') {
          return { role: msg.role, content: msg.content };
        }
        return { role: msg.role, content: JSON.stringify(msg.content) };
      });

      body = {
        model: config.model,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
        messages,
      };

      if (config.tools && config.tools.length > 0) {
        body.tools = config.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          },
        }));
      }
    }

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gateway error (${res.status}): ${err}`);
    }

    const reader = res.body!.getReader();

    if (isAnthropicModel(config.model)) {
      // Parse Anthropic SSE with tool use
      let activeToolId = '';
      let activeToolName = '';
      let activeToolInput = '';

      for await (const data of streamSSE(reader)) {
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
            if (activeToolId) {
              let input: Record<string, unknown> = {};
              try {
                if (activeToolInput) input = JSON.parse(activeToolInput);
              } catch { /* empty */ }
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
    } else {
      // Parse OpenAI SSE with tool use
      const toolCallBuffers: Map<number, { id: string; name: string; args: string }> = new Map();

      for await (const data of streamSSE(reader)) {
        try {
          const event = JSON.parse(data);
          const choice = event.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            yield { type: 'text', text: choice.delta.content };
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallBuffers.has(idx)) {
                toolCallBuffers.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
              }
              const buf = toolCallBuffers.get(idx)!;
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.function?.arguments) buf.args += tc.function.arguments;
            }
          }

          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            for (const [, buf] of toolCallBuffers) {
              let input: Record<string, unknown> = {};
              try { if (buf.args) input = JSON.parse(buf.args); } catch { /* empty */ }
              yield { type: 'tool_use', id: buf.id, name: buf.name, input };
            }
            toolCallBuffers.clear();
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    yield { type: 'message_end' };
  },
};
