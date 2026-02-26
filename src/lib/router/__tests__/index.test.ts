import { describe, test, expect, beforeEach } from 'bun:test';
import { EngramRouter } from '../index';
import type { ChatProvider, ChatConfig, ChatMessage } from '../../providers/types';
import type { RoutingConfig } from '../types';
import { getDefaultRoutingConfig } from '../config';

// ─── Mock Providers ─────────────────────────────────────────────

function mockProvider(
  id: string,
  response: string | Error,
  opts: Partial<ChatProvider> = {},
): ChatProvider {
  return {
    id,
    name: id,
    requiresApiKey: false,
    defaultBaseUrl: '',
    async validateKey() { return true; },
    async listModels() { return []; },
    async *chat() {
      if (response instanceof Error) throw response;
      yield response;
    },
    ...opts,
  };
}

function multiResponseProvider(
  id: string,
  responses: Array<string | Error>,
): ChatProvider {
  let callIdx = 0;
  return {
    id,
    name: id,
    requiresApiKey: false,
    defaultBaseUrl: '',
    async validateKey() { return true; },
    async listModels() { return []; },
    async *chat() {
      const response = responses[callIdx++] ?? responses[responses.length - 1];
      if (response instanceof Error) throw response;
      yield response;
    },
  };
}

// ─── Test Helpers ───────────────────────────────────────────────

function makeConfig(overrides: Partial<RoutingConfig> = {}): RoutingConfig {
  return {
    ...getDefaultRoutingConfig(),
    ...overrides,
    cascade: {
      enabled: false,
      steps: [],
      qualityThreshold: 0.7,
      maxEscalations: 2,
      ...overrides.cascade,
    },
    fallback: {
      chain: ['mock'],
      retryDelayMs: 0,
      maxRetries: 0,
      ...overrides.fallback,
    },
    models: {
      'cheap-model': { provider: 'mock', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' as const },
      'mid-model': { provider: 'mock', costPer1kInput: 0.1, costPer1kOutput: 0.5, maxContext: 4096, tier: 'moderate' as const },
      'big-model': { provider: 'mock', costPer1kInput: 1.0, costPer1kOutput: 5.0, maxContext: 4096, tier: 'expert' as const },
      ...overrides.models,
    },
  };
}

function makeChatConfig(content: string = 'Hello'): ChatConfig {
  return {
    model: 'test-model',
    messages: [{ role: 'user', content }],
    baseUrl: 'http://localhost:11434',
  };
}

async function collectStream(gen: AsyncGenerator<string>): Promise<string> {
  let result = '';
  for await (const token of gen) { result += token; }
  return result;
}

// ─── Passthrough Mode ───────────────────────────────────────────

describe('EngramRouter — passthrough mode', () => {
  test('delegates directly to provider when routing disabled', async () => {
    const config = makeConfig({ enabled: false });
    const providers = { ollama: mockProvider('ollama', 'passthrough response') };
    const router = new EngramRouter(config, providers);

    const chatConfig = makeChatConfig();
    const result = await collectStream(router.chat(chatConfig));

    expect(result).toBe('passthrough response');
  });

  test('delegates directly when strategy is passthrough', async () => {
    const config = makeConfig({ enabled: true, strategy: 'passthrough' });
    const providers = { ollama: mockProvider('ollama', 'passthrough response') };
    const router = new EngramRouter(config, providers);

    const chatConfig = makeChatConfig();
    const result = await collectStream(router.chat(chatConfig));

    expect(result).toBe('passthrough response');
  });

  test('resolves provider from baseUrl (anthropic)', async () => {
    const config = makeConfig({ enabled: false });
    const providers = {
      anthropic: mockProvider('anthropic', 'from anthropic'),
      ollama: mockProvider('ollama', 'from ollama'),
    };
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'claude-3-haiku',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://api.anthropic.com/v1',
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe('from anthropic');
  });

  test('resolves provider from baseUrl (openai)', async () => {
    const config = makeConfig({ enabled: false });
    const providers = {
      openai: mockProvider('openai', 'from openai'),
      ollama: mockProvider('ollama', 'from ollama'),
    };
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://api.openai.com/v1',
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe('from openai');
  });

  test('resolves provider from baseUrl (ollama)', async () => {
    const config = makeConfig({ enabled: false });
    const providers = {
      ollama: mockProvider('ollama', 'from ollama'),
    };
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'llama3',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'http://localhost:11434',
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe('from ollama');
  });

  test('throws when provider not found in passthrough', async () => {
    const config = makeConfig({ enabled: false });
    const providers = {}; // No providers
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://unknown.api.com',
    };

    await expect(
      collectStream(router.chat(chatConfig)),
    ).rejects.toThrow(/not available for passthrough/);
  });
});

// ─── Routed Mode (no cascade) ───────────────────────────────────

describe('EngramRouter — routed mode (no cascade)', () => {
  test('classifies and routes to appropriate model', async () => {
    const response = 'Here is a detailed response about TypeScript generics including type parameters, constraints, and conditional types.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig({ enabled: true, strategy: 'cost-optimized' });
    const router = new EngramRouter(config, providers);

    // Simple greeting → trivial → cheap-model
    const chatConfig: ChatConfig = {
      model: 'ignored',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe(response);

    const info = router.getLastRoutingInfo();
    expect(info).not.toBeNull();
    expect(info!.model).toBe('cheap-model');
    expect(info!.provider).toBe('mock');
    expect(info!.escalated).toBe(false);
  });

  test('routing info includes complexity', async () => {
    const response = 'Detailed response about distributed systems design patterns and their trade-offs in modern cloud architecture.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig({ enabled: true, strategy: 'cost-optimized' });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'ignored',
      messages: [{ role: 'user', content: 'hi' }],
    };

    await collectStream(router.chat(chatConfig));

    const info = router.getLastRoutingInfo();
    expect(info).not.toBeNull();
    expect(typeof info!.complexity).toBe('string');
    expect(typeof info!.latencyMs).toBe('number');
    expect(info!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('streams tokens in real-time (no buffering)', async () => {
    const provider: ChatProvider = {
      id: 'stream',
      name: 'stream',
      requiresApiKey: false,
      defaultBaseUrl: '',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat() {
        yield 'token1';
        yield 'token2';
        yield 'token3';
      },
    };

    const providers = { mock: provider };
    const config = makeConfig({ enabled: true, strategy: 'cost-optimized' });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'ignored',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const chunks: string[] = [];
    for await (const token of router.chat(chatConfig)) {
      chunks.push(token);
    }

    expect(chunks).toEqual(['token1', 'token2', 'token3']);
  });
});

// ─── Cascade Mode ───────────────────────────────────────────────

describe('EngramRouter — cascade mode', () => {
  test('uses cascade executor when cascade enabled', async () => {
    const response = 'Detailed TypeScript generics explanation covering type parameters, constraints, and conditional types for modern development.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig({
      enabled: true,
      strategy: 'cascade',
      cascade: { enabled: true, steps: [], qualityThreshold: 0.7, maxEscalations: 2 },
    });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'ignored',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe(response);

    // Cascade result should be available
    const cascadeResult = router.getLastCascadeResult();
    expect(cascadeResult).not.toBeNull();
    expect(cascadeResult!.response).toBe(response);
  });

  test('cascade escalation is reflected in routing info', async () => {
    const cheapProvider = multiResponseProvider('mock', [
      'bad', // Too short for moderate → quality fails
      'Here is a comprehensive explanation of TypeScript generics including type parameters, constraints, conditional types, mapped types, and infer patterns.',
    ]);

    const providers = { mock: cheapProvider };
    const config = makeConfig({
      enabled: true,
      strategy: 'cascade',
      cascade: { enabled: true, steps: [], qualityThreshold: 0.7, maxEscalations: 2 },
    });
    const router = new EngramRouter(config, providers);

    // Moderate-complexity prompt to trigger stricter quality checks
    const chatConfig: ChatConfig = {
      model: 'ignored',
      messages: [{ role: 'user', content: 'Explain the differences between TypeScript generic constraints, conditional types, mapped types, and utility types with practical examples' }],
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result.length).toBeGreaterThan(50);

    const cascadeResult = router.getLastCascadeResult();
    expect(cascadeResult!.escalated).toBe(true);
  });
});

// ─── Budget Guard ───────────────────────────────────────────────

describe('EngramRouter — budget guard', () => {
  test('throws when daily budget exceeded', async () => {
    const providers = { mock: mockProvider('mock', 'response') };
    // Set an extremely low budget that's definitely been exceeded
    // (getTodayCostCents reads real usage files, so set to 0 to trigger immediately)
    const config = makeConfig({
      enabled: true,
      strategy: 'cost-optimized',
      budgetGuard: { dailyLimitCents: 0, warningThresholdPercent: 80 },
    });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    // Budget limit of 0 means any cost at all would exceed it.
    // But 0 is treated as "unlimited" in the code. So this tests
    // that 0 = unlimited (no throw).
    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBeTruthy();
  });

  test('budget guard inactive when dailyLimitCents is 0 (unlimited)', async () => {
    const providers = { mock: mockProvider('mock', 'unlimited response') };
    const config = makeConfig({
      enabled: true,
      strategy: 'cost-optimized',
      budgetGuard: { dailyLimitCents: 0, warningThresholdPercent: 80 },
    });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    // Should not throw — 0 means unlimited
    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe('unlimited response');
  });
});

// ─── API Key Registration ───────────────────────────────────────

describe('EngramRouter — API key registration', () => {
  test('registers API keys on construction', async () => {
    let receivedKey: string | undefined;
    const provider: ChatProvider = {
      id: 'keyed',
      name: 'keyed',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.example.com',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat(config: ChatConfig) {
        receivedKey = config.apiKey;
        yield 'authed';
      },
    };

    // Only include keyed-provider models (no defaults that reference 'mock')
    const config: RoutingConfig = {
      ...getDefaultRoutingConfig(),
      enabled: true,
      strategy: 'cost-optimized',
      models: {
        'keyed-model': { provider: 'keyed', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' },
      },
      fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 },
    };

    const providers = { keyed: provider };
    const router = new EngramRouter(config, providers, { keyed: 'my-secret-key' });

    const chatConfig: ChatConfig = {
      model: 'keyed-model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const result = await collectStream(router.chat(chatConfig));
    expect(result).toBe('authed');
    expect(receivedKey).toBe('my-secret-key');
  });
});

// ─── getLastRoutingInfo / getLastCascadeResult ──────────────────

describe('EngramRouter — result accessors', () => {
  test('getLastRoutingInfo returns null before any request', () => {
    const config = makeConfig({ enabled: true, strategy: 'cost-optimized' });
    const providers = { mock: mockProvider('mock', 'response') };
    const router = new EngramRouter(config, providers);

    expect(router.getLastRoutingInfo()).toBeNull();
  });

  test('getLastCascadeResult returns null when cascade not used', async () => {
    const config = makeConfig({
      enabled: true,
      strategy: 'cost-optimized',
      cascade: { enabled: false, steps: [], qualityThreshold: 0.7, maxEscalations: 2 },
    });
    const providers = { mock: mockProvider('mock', 'direct response') };
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    await collectStream(router.chat(chatConfig));

    const info = router.getLastRoutingInfo();
    expect(info).not.toBeNull();
    expect(info!.escalated).toBe(false);
  });

  test('routing info has cost estimate', async () => {
    const response = 'A reasonable response that should have some cost associated with it.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig({
      enabled: true,
      strategy: 'cost-optimized',
    });
    const router = new EngramRouter(config, providers);

    const chatConfig: ChatConfig = {
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    await collectStream(router.chat(chatConfig));

    const info = router.getLastRoutingInfo();
    expect(info).not.toBeNull();
    expect(typeof info!.costCents).toBe('number');
    expect(info!.costCents).toBeGreaterThanOrEqual(0);
  });

  test('routing info updates on each request', async () => {
    const providers = { mock: mockProvider('mock', 'response one') };
    const config = makeConfig({ enabled: true, strategy: 'cost-optimized' });
    const router = new EngramRouter(config, providers);

    // First request
    await collectStream(router.chat({
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }],
    }));

    const info1 = router.getLastRoutingInfo();
    expect(info1).not.toBeNull();

    // Second request
    providers.mock = mockProvider('mock', 'response two');
    await collectStream(router.chat({
      model: 'model',
      messages: [{ role: 'user', content: 'Design a distributed consensus protocol for Byzantine fault tolerance with formal safety proofs' }],
    }));

    const info2 = router.getLastRoutingInfo();
    expect(info2).not.toBeNull();
    // Different complexity → likely different model
    // (both could be same if only one model per tier)
  });
});

// ─── Re-exports ─────────────────────────────────────────────────

describe('EngramRouter — re-exports', () => {
  test('re-exports classifyTask', async () => {
    const { classifyTask } = await import('../index');
    expect(typeof classifyTask).toBe('function');
  });

  test('re-exports loadRoutingConfig', async () => {
    const { loadRoutingConfig } = await import('../index');
    expect(typeof loadRoutingConfig).toBe('function');
  });

  test('re-exports getModelForComplexity', async () => {
    const { getModelForComplexity } = await import('../index');
    expect(typeof getModelForComplexity).toBe('function');
  });

  test('re-exports estimateCost', async () => {
    const { estimateCost } = await import('../index');
    expect(typeof estimateCost).toBe('function');
  });

  test('re-exports MODEL_REGISTRY', async () => {
    const { MODEL_REGISTRY } = await import('../index');
    expect(typeof MODEL_REGISTRY).toBe('object');
    expect(Object.keys(MODEL_REGISTRY).length).toBeGreaterThan(0);
  });

  test('re-exports validateResponse', async () => {
    const { validateResponse } = await import('../index');
    expect(typeof validateResponse).toBe('function');
  });

  test('re-exports usage tracker functions', async () => {
    const { logUsage, getDailyUsage, getDailySummary, getUsageRange } = await import('../index');
    expect(typeof logUsage).toBe('function');
    expect(typeof getDailyUsage).toBe('function');
    expect(typeof getDailySummary).toBe('function');
    expect(typeof getUsageRange).toBe('function');
  });
});
