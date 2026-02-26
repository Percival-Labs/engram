import { describe, test, expect, beforeEach } from 'bun:test';
import { routeToProvider, registerApiKey } from '../provider-router';
import type { ChatProvider, ChatMessage, ChatConfig } from '../../providers/types';
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

/** Provider that requires an API key. */
function keyRequiredProvider(
  id: string,
  response: string | Error,
): ChatProvider {
  return mockProvider(id, response, {
    requiresApiKey: true,
    defaultBaseUrl: `https://${id}.example.com/v1`,
  });
}

/** Provider that tracks how many times chat() was called. */
function countingProvider(
  id: string,
  response: string | Error,
  opts: Partial<ChatProvider> = {},
): ChatProvider & { callCount: number } {
  let callCount = 0;
  return {
    id,
    name: id,
    requiresApiKey: false,
    defaultBaseUrl: '',
    async validateKey() { return true; },
    async listModels() { return []; },
    async *chat() {
      callCount++;
      if (response instanceof Error) throw response;
      yield response;
    },
    get callCount() { return callCount; },
    ...opts,
  };
}

// ─── Test Helpers ───────────────────────────────────────────────

function makeConfig(overrides: Partial<RoutingConfig> = {}): RoutingConfig {
  return {
    ...getDefaultRoutingConfig(),
    enabled: true,
    strategy: 'cascade',
    fallback: {
      chain: ['fallback1', 'fallback2'],
      retryDelayMs: 0,
      maxRetries: 0,
      ...overrides.fallback,
    },
    ...overrides,
  };
}

const messages: ChatMessage[] = [
  { role: 'user', content: 'Hello' },
];

async function collectStream(gen: AsyncGenerator<string>): Promise<string> {
  let result = '';
  for await (const token of gen) { result += token; }
  return result;
}

// ─── Basic Routing ──────────────────────────────────────────────

describe('routeToProvider — basic routing', () => {
  test('routes to specified provider and returns response', async () => {
    const providers = { primary: mockProvider('primary', 'Hello from primary') };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    const result = await collectStream(
      routeToProvider('test-model', 'primary', messages, config, providers),
    );

    expect(result).toBe('Hello from primary');
  });

  test('streams tokens from provider', async () => {
    const provider: ChatProvider = {
      id: 'chunky',
      name: 'chunky',
      requiresApiKey: false,
      defaultBaseUrl: '',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat() {
        yield 'chunk1';
        yield 'chunk2';
        yield 'chunk3';
      },
    };

    const providers = { chunky: provider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    const chunks: string[] = [];
    for await (const token of routeToProvider('model', 'chunky', messages, config, providers)) {
      chunks.push(token);
    }

    expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
  });

  test('skips provider not found in providers map', async () => {
    const providers = { actual: mockProvider('actual', 'from actual') };
    const config = makeConfig({ fallback: { chain: ['actual'], retryDelayMs: 0, maxRetries: 0 } });

    const result = await collectStream(
      routeToProvider('model', 'nonexistent', messages, config, providers),
    );

    // Falls through to 'actual' in fallback chain
    expect(result).toBe('from actual');
  });

  test('throws when no providers available', async () => {
    const providers = {};
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    await expect(
      collectStream(routeToProvider('model', 'ghost', messages, config, providers)),
    ).rejects.toThrow();
  });
});

// ─── Fallback Chain ─────────────────────────────────────────────

describe('routeToProvider — fallback chain', () => {
  test('falls back to next provider on error', async () => {
    const providers = {
      primary: mockProvider('primary', new Error('primary down')),
      fallback1: mockProvider('fallback1', 'from fallback'),
    };
    const config = makeConfig();

    const result = await collectStream(
      routeToProvider('model', 'primary', messages, config, providers),
    );

    expect(result).toBe('from fallback');
  });

  test('tries all providers in fallback chain order', async () => {
    const providers = {
      primary: mockProvider('primary', new Error('down')),
      fallback1: mockProvider('fallback1', new Error('also down')),
      fallback2: mockProvider('fallback2', 'from last resort'),
    };
    const config = makeConfig();

    const result = await collectStream(
      routeToProvider('model', 'primary', messages, config, providers),
    );

    expect(result).toBe('from last resort');
  });

  test('throws last error when all providers fail', async () => {
    const providers = {
      primary: mockProvider('primary', new Error('primary down')),
      fallback1: mockProvider('fallback1', new Error('fallback1 down')),
      fallback2: mockProvider('fallback2', new Error('all dead')),
    };
    const config = makeConfig();

    await expect(
      collectStream(routeToProvider('model', 'primary', messages, config, providers)),
    ).rejects.toThrow('all dead');
  });

  test('primary provider not duplicated in fallback chain', async () => {
    // Use unique IDs to avoid circuit breaker state from earlier tests
    const callTracker = countingProvider('dedup-primary', new Error('down'));
    const providers = {
      'dedup-primary': callTracker,
      'dedup-fallback': mockProvider('dedup-fallback', 'saved'),
    };
    const config = makeConfig({
      fallback: { chain: ['dedup-primary', 'dedup-fallback'], retryDelayMs: 0, maxRetries: 0 },
    });

    const result = await collectStream(
      routeToProvider('model', 'dedup-primary', messages, config, providers),
    );

    expect(result).toBe('saved');
    // Primary is first in attempt chain, then filtered from fallback, so tried once
    expect(callTracker.callCount).toBe(1);
  });
});

// ─── API Key Handling ───────────────────────────────────────────

describe('routeToProvider — API key handling', () => {
  test('skips provider that requires key when none available', async () => {
    const providers = {
      cloud: keyRequiredProvider('cloud', 'from cloud'),
      local: mockProvider('local', 'from local'),
    };
    const config = makeConfig({
      fallback: { chain: ['local'], retryDelayMs: 0, maxRetries: 0 },
    });

    const result = await collectStream(
      routeToProvider('model', 'cloud', messages, config, providers),
    );

    // Should skip cloud (no key), fall to local
    expect(result).toBe('from local');
  });

  test('uses registered API key for provider', async () => {
    registerApiKey('keyed', 'test-api-key-123');

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
        yield 'authenticated response';
      },
    };

    const providers = { keyed: provider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    const result = await collectStream(
      routeToProvider('model', 'keyed', messages, config, providers),
    );

    expect(result).toBe('authenticated response');
    expect(receivedKey).toBe('test-api-key-123');
  });

  test('ollama skipped when requiresApiKey but no key available', async () => {
    // Ollama doesn't need a key, so if a provider is ollama-like (no key required)
    // it should still work
    const providers = {
      ollama: mockProvider('ollama', 'local response'),
    };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    const result = await collectStream(
      routeToProvider('model', 'ollama', messages, config, providers),
    );

    expect(result).toBe('local response');
  });
});

// ─── Circuit Breaker ────────────────────────────────────────────

describe('routeToProvider — circuit breaker', () => {
  test('opens circuit after threshold failures', async () => {
    // Fail 3 times on 'flaky' provider to open circuit
    const flaky = mockProvider('flaky', new Error('timeout'));
    const reliable = mockProvider('reliable', 'reliable response');

    const providers = { flaky, reliable };
    const config = makeConfig({
      fallback: { chain: ['reliable'], retryDelayMs: 0, maxRetries: 0 },
    });

    // Trigger 3 failures (circuit threshold)
    for (let i = 0; i < 3; i++) {
      await collectStream(
        routeToProvider('model', 'flaky', messages, config, providers),
      );
    }

    // 4th call: flaky's circuit should be open, goes straight to reliable
    const callTracker = countingProvider('reliable', 'direct to reliable');
    providers.reliable = callTracker;
    // Replace flaky with one that would succeed (to prove circuit skips it)
    providers.flaky = mockProvider('flaky', 'flaky recovered');

    const result = await collectStream(
      routeToProvider('model', 'flaky', messages, config, providers),
    );

    // Should have gone to reliable, not flaky (circuit open)
    expect(result).toBe('direct to reliable');
  });

  test('circuit resets on success', async () => {
    const providers = {
      p1: mockProvider('p1', new Error('fail')),
      backup: mockProvider('backup', 'backup ok'),
    };
    const config = makeConfig({
      fallback: { chain: ['backup'], retryDelayMs: 0, maxRetries: 0 },
    });

    // Fail twice (below threshold of 3)
    await collectStream(routeToProvider('m', 'p1', messages, config, providers));
    await collectStream(routeToProvider('m', 'p1', messages, config, providers));

    // Now succeed
    providers.p1 = mockProvider('p1', 'recovered');
    const result = await collectStream(
      routeToProvider('m', 'p1', messages, config, providers),
    );

    expect(result).toBe('recovered');

    // After success, circuit should be reset — fail again should still try p1
    providers.p1 = mockProvider('p1', new Error('fail again'));
    const result2 = await collectStream(
      routeToProvider('m', 'p1', messages, config, providers),
    );
    // Falls to backup (p1 failed, but circuit was reset so it was tried)
    expect(result2).toBe('backup ok');
  });
});

// ─── ChatConfig Construction ────────────────────────────────────

describe('routeToProvider — config construction', () => {
  test('passes model name to provider', async () => {
    let receivedModel = '';
    const provider: ChatProvider = {
      id: 'check',
      name: 'check',
      requiresApiKey: false,
      defaultBaseUrl: 'http://localhost:1234',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat(config: ChatConfig) {
        receivedModel = config.model;
        yield 'ok';
      },
    };

    const providers = { check: provider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    await collectStream(
      routeToProvider('gpt-4o-mini', 'check', messages, config, providers),
    );

    expect(receivedModel).toBe('gpt-4o-mini');
  });

  test('passes messages to provider', async () => {
    let receivedMessages: ChatMessage[] = [];
    const provider: ChatProvider = {
      id: 'check',
      name: 'check',
      requiresApiKey: false,
      defaultBaseUrl: '',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat(config: ChatConfig) {
        receivedMessages = config.messages;
        yield 'ok';
      },
    };

    const providers = { check: provider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    const testMessages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Say hello' },
    ];

    await collectStream(
      routeToProvider('model', 'check', testMessages, config, providers),
    );

    expect(receivedMessages).toEqual(testMessages);
  });

  test('uses provider defaultBaseUrl in chat config', async () => {
    let receivedBaseUrl = '';
    const provider: ChatProvider = {
      id: 'custom',
      name: 'custom',
      requiresApiKey: false,
      defaultBaseUrl: 'https://custom.api.example.com/v2',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat(config: ChatConfig) {
        receivedBaseUrl = config.baseUrl ?? '';
        yield 'ok';
      },
    };

    const providers = { custom: provider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    await collectStream(
      routeToProvider('model', 'custom', messages, config, providers),
    );

    expect(receivedBaseUrl).toBe('https://custom.api.example.com/v2');
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe('routeToProvider — edge cases', () => {
  test('handles provider that yields nothing (empty stream)', async () => {
    const emptyProvider: ChatProvider = {
      id: 'empty',
      name: 'empty',
      requiresApiKey: false,
      defaultBaseUrl: '',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat() {
        // Yields nothing
      },
    };

    const backup = mockProvider('backup', 'backup response');
    const providers = { empty: emptyProvider, backup };
    const config = makeConfig({
      fallback: { chain: ['backup'], retryDelayMs: 0, maxRetries: 0 },
    });

    // Empty stream should not count as success — falls to backup
    const result = await collectStream(
      routeToProvider('model', 'empty', messages, config, providers),
    );

    expect(result).toBe('backup response');
  });

  test('non-Error thrown is wrapped', async () => {
    const badProvider: ChatProvider = {
      id: 'bad',
      name: 'bad',
      requiresApiKey: false,
      defaultBaseUrl: '',
      async validateKey() { return true; },
      async listModels() { return []; },
      async *chat() {
        throw 'string error';
      },
    };

    const providers = { bad: badProvider };
    const config = makeConfig({ fallback: { chain: [], retryDelayMs: 0, maxRetries: 0 } });

    await expect(
      collectStream(routeToProvider('model', 'bad', messages, config, providers)),
    ).rejects.toThrow();
  });

  test('retry delay is applied between fallback attempts', async () => {
    const start = Date.now();
    const providers = {
      p1: mockProvider('p1', new Error('fail')),
      p2: mockProvider('p2', 'ok'),
    };
    const config = makeConfig({
      fallback: { chain: ['p2'], retryDelayMs: 50, maxRetries: 0 },
    });

    await collectStream(
      routeToProvider('model', 'p1', messages, config, providers),
    );

    const elapsed = Date.now() - start;
    // Should have waited ~50ms for retry delay
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
