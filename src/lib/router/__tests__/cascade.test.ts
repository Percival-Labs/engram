import { describe, test, expect } from 'bun:test';
import { executeCascade, lastCascadeResult } from '../cascade';
import type { ClassificationResult, RoutingConfig, CascadeStep } from '../types';
import type { ChatProvider, ChatMessage } from '../../providers/types';
import { getDefaultRoutingConfig } from '../config';

// ─── Mock Providers ─────────────────────────────────────────────

/** Create a mock provider that yields the given response tokens. */
function mockProvider(
  id: string,
  response: string | Error,
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
      // Yield in small chunks to simulate streaming
      const chunks = response.match(/.{1,20}/g) ?? [];
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

/** Create a mock provider whose response changes per call (for escalation testing). */
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

function makeClassification(complexity: ClassificationResult['complexity']): ClassificationResult {
  return {
    complexity,
    signals: { entropy: 4.0, cognitiveVerbs: 1, clauseDepth: 1, codeDetected: false, avgWordLength: 5, tokenEstimate: 50 },
    confidence: 0.8,
  };
}

function makeConfig(overrides: Partial<RoutingConfig> = {}): RoutingConfig {
  return {
    ...getDefaultRoutingConfig(),
    enabled: true,
    strategy: 'cascade',
    cascade: {
      enabled: true,
      steps: [],
      qualityThreshold: 0.7,
      maxEscalations: 2,
      ...overrides.cascade,
    },
    models: {
      'cheap-model': { provider: 'mock', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' as const },
      'mid-model': { provider: 'mock', costPer1kInput: 0.1, costPer1kOutput: 0.5, maxContext: 4096, tier: 'moderate' as const },
      'big-model': { provider: 'mock', costPer1kInput: 1.0, costPer1kOutput: 5.0, maxContext: 4096, tier: 'expert' as const },
      ...overrides.models,
    },
    fallback: {
      chain: ['mock'],
      retryDelayMs: 0,
      maxRetries: 0,
      ...overrides.fallback,
    },
    ...overrides,
    // Re-spread nested to avoid overwrite
  };
}

const messages: ChatMessage[] = [
  { role: 'user', content: 'Tell me about TypeScript generics and their practical applications in modern development' },
];

async function collectStream(gen: AsyncGenerator<string>): Promise<string> {
  let result = '';
  for await (const token of gen) { result += token; }
  return result;
}

// ─── Dynamic Cascade (tier-based) ───────────────────────────────

describe('executeCascade — dynamic tier-based', () => {
  test('uses classified tier model on first attempt', async () => {
    const goodResponse = 'TypeScript generics allow you to write reusable components that work with multiple types. They are essential for type-safe collections, API wrappers, and utility types.';
    const providers = { mock: mockProvider('mock', goodResponse) };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    const result = await collectStream(
      executeCascade(messages, classification, config, providers),
    );

    expect(result).toBe(goodResponse);
    expect(lastCascadeResult).not.toBeNull();
    expect(lastCascadeResult!.model).toBe('cheap-model');
    expect(lastCascadeResult!.escalated).toBe(false);
  });

  test('escalates when quality check fails', async () => {
    // cheap-model returns a bad response, mid-model returns a good one
    const cheapProvider = multiResponseProvider('mock', [
      'ok.', // Too short → quality fails (moderate minLen=50)
      'TypeScript generics provide a way to create reusable, type-safe components. They allow functions and classes to operate on multiple types while maintaining compile-time type checking.',
    ]);

    const providers = { mock: cheapProvider };
    const config = makeConfig();
    const classification = makeClassification('moderate');

    const result = await collectStream(
      executeCascade(messages, classification, config, providers),
    );

    expect(result.length).toBeGreaterThan(50);
    expect(lastCascadeResult!.escalated).toBe(true);
    expect(lastCascadeResult!.attempts.length).toBeGreaterThan(1);
  });

  test('escalates on provider error', async () => {
    const errorThenSuccess = multiResponseProvider('mock', [
      new Error('Connection refused'),
      'TypeScript generics let you parameterize types. Common patterns include generic functions, generic classes, and conditional types for advanced transformations.',
    ]);

    const providers = { mock: errorThenSuccess };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    const result = await collectStream(
      executeCascade(messages, classification, config, providers),
    );

    expect(result.length).toBeGreaterThan(50);
    expect(lastCascadeResult!.escalated).toBe(true);
  });

  test('respects maxEscalations limit', async () => {
    // All responses are bad — should stop after maxEscalations
    const alwaysBad = multiResponseProvider('mock', [
      'x', 'x', 'x', 'x', 'x',
    ]);

    const providers = { mock: alwaysBad };
    const config = makeConfig({ cascade: { enabled: true, steps: [], qualityThreshold: 0.7, maxEscalations: 1 } });
    const classification = makeClassification('trivial');

    // Should still return something (last attempt) rather than throw
    const result = await collectStream(
      executeCascade(messages, classification, config, providers),
    );

    // With maxEscalations=1: attempt 0 (trivial) fails quality, attempt 1 (simple) is the last chance
    expect(lastCascadeResult!.attempts.length).toBeLessThanOrEqual(2);
  });

  test('throws when all tiers exhausted with errors', async () => {
    const alwaysError = mockProvider('mock', new Error('All models down'));
    const providers = { mock: alwaysError };
    const config = makeConfig();
    // Start at 'expert' — only one tier to try, and it errors
    const classification = makeClassification('expert');

    await expect(
      collectStream(executeCascade(messages, classification, config, providers)),
    ).rejects.toThrow();
  });

  test('populates lastCascadeResult correctly', async () => {
    const response = 'Generics in TypeScript are a powerful feature for creating reusable and type-safe abstractions across your codebase.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    await collectStream(executeCascade(messages, classification, config, providers));

    expect(lastCascadeResult).not.toBeNull();
    expect(lastCascadeResult!.response).toBe(response);
    expect(lastCascadeResult!.model).toBe('cheap-model');
    expect(lastCascadeResult!.provider).toBe('mock');
    expect(lastCascadeResult!.attempts.length).toBeGreaterThanOrEqual(1);
    expect(lastCascadeResult!.tokensUsed).toBe(Math.ceil(response.length / 4));
    expect(typeof lastCascadeResult!.escalated).toBe('boolean');
  });

  test('moderate classification starts at moderate tier', async () => {
    const response = 'Here is a comprehensive TypeScript generics explanation covering type parameters, constraints, conditional types, mapped types, and infer patterns used in modern development.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig();
    const classification = makeClassification('moderate');

    await collectStream(executeCascade(messages, classification, config, providers));

    // Should have picked mid-model (moderate tier), not cheap-model (trivial)
    expect(lastCascadeResult!.model).toBe('mid-model');
  });

  test('expert classification goes straight to expert tier', async () => {
    const response = 'TypeScript generics at the expert level involve higher-kinded types emulation, recursive conditional types, template literal type arithmetic, and variance annotations for covariant and contravariant positions.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig();
    const classification = makeClassification('expert');

    await collectStream(executeCascade(messages, classification, config, providers));

    expect(lastCascadeResult!.model).toBe('big-model');
    expect(lastCascadeResult!.escalated).toBe(false);
  });
});

// ─── Explicit Steps Cascade ─────────────────────────────────────

describe('executeCascade — explicit steps', () => {
  test('uses configured steps in order', async () => {
    const response = 'TypeScript generics explained thoroughly using step-configured models with provider routing and quality validation.';
    const providers = { mock: mockProvider('mock', response) };

    const steps: CascadeStep[] = [
      { model: 'step-cheap', provider: 'mock' },
      { model: 'step-mid', provider: 'mock' },
      { model: 'step-big', provider: 'mock' },
    ];
    const config = makeConfig({ cascade: { enabled: true, steps, qualityThreshold: 0.7, maxEscalations: 2 } });
    const classification = makeClassification('moderate');

    await collectStream(executeCascade(messages, classification, config, providers));

    // First step should succeed (good response)
    expect(lastCascadeResult!.model).toBe('step-cheap');
    expect(lastCascadeResult!.escalated).toBe(false);
  });

  test('escalates through explicit steps on quality failure', async () => {
    const cheapProvider = multiResponseProvider('mock', [
      'bad',  // step 1 fails quality
      'TypeScript generics are a fundamental feature that enables creation of reusable, type-safe code components working across different data types.',
    ]);

    const steps: CascadeStep[] = [
      { model: 'step-cheap', provider: 'mock' },
      { model: 'step-big', provider: 'mock' },
    ];
    const providers = { mock: cheapProvider };
    const config = makeConfig({ cascade: { enabled: true, steps, qualityThreshold: 0.7, maxEscalations: 2 } });
    const classification = makeClassification('moderate');

    await collectStream(executeCascade(messages, classification, config, providers));

    expect(lastCascadeResult!.model).toBe('step-big');
    expect(lastCascadeResult!.escalated).toBe(true);
    expect(lastCascadeResult!.attempts).toHaveLength(2);
  });

  test('last step always accepted regardless of quality', async () => {
    const alwaysBad = multiResponseProvider('mock', ['x', 'y', 'z']);
    const steps: CascadeStep[] = [
      { model: 's1', provider: 'mock' },
      { model: 's2', provider: 'mock' },
      { model: 's3', provider: 'mock' },
    ];
    const providers = { mock: alwaysBad };
    const config = makeConfig({ cascade: { enabled: true, steps, qualityThreshold: 0.99, maxEscalations: 5 } });
    const classification = makeClassification('moderate');

    const result = await collectStream(
      executeCascade(messages, classification, config, providers),
    );

    // Last step's response should be returned even though quality is bad
    expect(result).toBe('z');
    expect(lastCascadeResult!.model).toBe('s3');
  });

  test('throws when all explicit steps error', async () => {
    const alwaysError = mockProvider('mock', new Error('down'));
    const steps: CascadeStep[] = [
      { model: 's1', provider: 'mock' },
    ];
    const providers = { mock: alwaysError };
    const config = makeConfig({ cascade: { enabled: true, steps, qualityThreshold: 0.7, maxEscalations: 2 } });
    const classification = makeClassification('moderate');

    await expect(
      collectStream(executeCascade(messages, classification, config, providers)),
    ).rejects.toThrow('Cascade exhausted all configured steps');
  });
});

// ─── Quality Threshold Behavior ─────────────────────────────────

describe('executeCascade — quality threshold', () => {
  test('low threshold accepts mediocre responses without escalation', async () => {
    // Short but not empty — with threshold 0.3 should pass
    const response = 'Generics let you parameterize types in TypeScript.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig({ cascade: { enabled: true, steps: [], qualityThreshold: 0.3, maxEscalations: 2 } });
    const classification = makeClassification('trivial');

    await collectStream(executeCascade(messages, classification, config, providers));

    expect(lastCascadeResult!.escalated).toBe(false);
  });

  test('high threshold causes escalation on decent responses', async () => {
    const decent = multiResponseProvider('mock', [
      'Generics in TypeScript.',  // too short for moderate minLen=50 → quality fails
      'TypeScript generics are a type system feature allowing parameterized types. They enable writing functions, classes, and interfaces that work with multiple types while preserving type safety at compile time.',
    ]);

    const providers = { mock: decent };
    const config = makeConfig({ cascade: { enabled: true, steps: [], qualityThreshold: 0.99, maxEscalations: 2 } });
    const classification = makeClassification('moderate');

    await collectStream(executeCascade(messages, classification, config, providers));

    // Should have escalated due to high threshold
    expect(lastCascadeResult!.attempts.length).toBeGreaterThan(1);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe('executeCascade — edge cases', () => {
  test('handles empty user message gracefully', async () => {
    const response = 'I can help you with anything you need. Please provide more details about your question.';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    const emptyMessages: ChatMessage[] = [
      { role: 'user', content: '' },
    ];

    const result = await collectStream(
      executeCascade(emptyMessages, classification, config, providers),
    );

    expect(result).toBe(response);
  });

  test('handles system-only messages', async () => {
    const response = 'Hello! How can I assist you today?';
    const providers = { mock: mockProvider('mock', response) };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    const sysMessages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
    ];

    const result = await collectStream(
      executeCascade(sysMessages, classification, config, providers),
    );

    expect(result).toBe(response);
  });

  test('streaming yields full buffered response', async () => {
    const fullText = 'TypeScript generics are powerful. '.repeat(10).trim();
    const providers = { mock: mockProvider('mock', fullText) };
    const config = makeConfig();
    const classification = makeClassification('trivial');

    // Collect individual yields
    const chunks: string[] = [];
    for await (const chunk of executeCascade(messages, classification, config, providers)) {
      chunks.push(chunk);
    }

    // Cascade buffers fully then yields as one chunk
    expect(chunks.join('')).toBe(fullText);
  });
});
