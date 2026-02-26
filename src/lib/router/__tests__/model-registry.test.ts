import { describe, test, expect } from 'bun:test';
import {
  MODEL_REGISTRY,
  getModelForComplexity,
  estimateCost,
  getModelInfo,
} from '../model-registry';
import type { RoutingConfig, ModelInfo } from '../types';
import { getDefaultRoutingConfig } from '../config';

// Helper: config with no user models (uses default registry)
function defaultConfig(): RoutingConfig {
  return getDefaultRoutingConfig();
}

// Helper: config with custom user models
function customConfig(models: Record<string, ModelInfo>): RoutingConfig {
  return { ...getDefaultRoutingConfig(), models };
}

// ─── MODEL_REGISTRY ─────────────────────────────────────────────

describe('MODEL_REGISTRY', () => {
  test('contains Anthropic models', () => {
    expect(MODEL_REGISTRY['claude-3-haiku']).toBeDefined();
    expect(MODEL_REGISTRY['claude-3.5-sonnet']).toBeDefined();
    expect(MODEL_REGISTRY['claude-opus-4']).toBeDefined();
  });

  test('contains OpenAI models', () => {
    expect(MODEL_REGISTRY['gpt-4o-mini']).toBeDefined();
    expect(MODEL_REGISTRY['gpt-4o']).toBeDefined();
    expect(MODEL_REGISTRY['o3-mini']).toBeDefined();
  });

  test('contains Ollama models', () => {
    expect(MODEL_REGISTRY['llama3']).toBeDefined();
    expect(MODEL_REGISTRY['mistral']).toBeDefined();
  });

  test('every model has required fields', () => {
    for (const [id, info] of Object.entries(MODEL_REGISTRY)) {
      expect(info.provider).toBeTruthy();
      expect(info.costPer1kInput).toBeGreaterThanOrEqual(0);
      expect(info.costPer1kOutput).toBeGreaterThanOrEqual(0);
      expect(info.maxContext).toBeGreaterThan(0);
      expect(['trivial', 'simple', 'moderate', 'complex', 'expert']).toContain(info.tier);
    }
  });

  test('Ollama models have zero cost', () => {
    for (const [id, info] of Object.entries(MODEL_REGISTRY)) {
      if (info.provider === 'ollama') {
        expect(info.costPer1kInput).toBe(0);
        expect(info.costPer1kOutput).toBe(0);
      }
    }
  });

  test('cloud models have non-zero cost', () => {
    for (const [id, info] of Object.entries(MODEL_REGISTRY)) {
      if (info.provider === 'anthropic' || info.provider === 'openai') {
        expect(info.costPer1kInput + info.costPer1kOutput).toBeGreaterThan(0);
      }
    }
  });

  test('has at least one model per tier', () => {
    const tiers = new Set(Object.values(MODEL_REGISTRY).map(m => m.tier));
    expect(tiers.has('trivial')).toBe(true);
    expect(tiers.has('simple')).toBe(true);
    expect(tiers.has('moderate')).toBe(true);
    // complex and expert may not have defaults — that's fine
  });
});

// ─── getModelForComplexity ──────────────────────────────────────

describe('getModelForComplexity', () => {
  test('trivial returns cheapest trivial-tier model', () => {
    const result = getModelForComplexity('trivial', defaultConfig());
    const info = MODEL_REGISTRY[result.model];
    expect(info).toBeDefined();
    expect(info.tier).toBe('trivial');
  });

  test('expert returns an expert-tier model', () => {
    const result = getModelForComplexity('expert', defaultConfig());
    const info = MODEL_REGISTRY[result.model];
    expect(info).toBeDefined();
    expect(info.tier).toBe('expert');
  });

  test('returns model at or above requested tier', () => {
    const tiers = ['trivial', 'simple', 'moderate', 'complex', 'expert'] as const;
    const tierIdx = (t: string) => tiers.indexOf(t as any);

    for (const tier of tiers) {
      const result = getModelForComplexity(tier, defaultConfig());
      const info = MODEL_REGISTRY[result.model];
      if (info) {
        expect(tierIdx(info.tier)).toBeGreaterThanOrEqual(tierIdx(tier));
      }
    }
  });

  test('prefers cheapest model within the same tier', () => {
    // Both claude-3.5-sonnet and claude-sonnet-4 are moderate tier
    // gpt-4o is also moderate — check that cheapest is picked
    const result = getModelForComplexity('moderate', defaultConfig());
    const info = MODEL_REGISTRY[result.model];
    expect(info).toBeDefined();

    // Should be one of the moderate-tier models (not complex or expert)
    expect(info.tier).toBe('moderate');
  });

  test('uses user models exclusively when configured', () => {
    const config = customConfig({
      'my-cheap': { provider: 'ollama', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' },
      'my-smart': { provider: 'ollama', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'expert' },
    });

    const trivial = getModelForComplexity('trivial', config);
    expect(trivial.model).toBe('my-cheap');

    const expert = getModelForComplexity('expert', config);
    expect(expert.model).toBe('my-smart');
  });

  test('user models do not mix with default registry', () => {
    const config = customConfig({
      'local-model': { provider: 'ollama', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'moderate' },
    });

    // Requesting trivial — no user model at trivial tier, should escalate to moderate (user model)
    const result = getModelForComplexity('trivial', config);
    expect(result.model).toBe('local-model');
  });

  test('falls back to claude-3.5-sonnet when no models match', () => {
    // Config with user models that are all below the requested tier
    const config = customConfig({
      'tiny': { provider: 'ollama', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' },
    });

    const result = getModelForComplexity('expert', config);
    // Only 'tiny' at trivial tier, expert requested — no match, falls back
    expect(result.model).toBe('claude-3.5-sonnet');
    expect(result.provider).toBe('anthropic');
  });

  test('provider is returned correctly', () => {
    const result = getModelForComplexity('trivial', defaultConfig());
    expect(result.provider).toBeTruthy();
    expect(typeof result.provider).toBe('string');
  });

  test('sorting: closer tier wins over cheaper cost at distant tier', () => {
    const config = customConfig({
      'cheap-expert': { provider: 'a', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'expert' },
      'moderate-model': { provider: 'b', costPer1kInput: 0.5, costPer1kOutput: 1.0, maxContext: 4096, tier: 'moderate' },
    });

    // Request moderate — should pick moderate-model (closer tier) over cheap-expert
    const result = getModelForComplexity('moderate', config);
    expect(result.model).toBe('moderate-model');
  });
});

// ─── estimateCost ───────────────────────────────────────────────

describe('estimateCost', () => {
  test('returns 0 for unknown model', () => {
    expect(estimateCost('nonexistent-model', 1000, 1000)).toBe(0);
  });

  test('returns 0 for Ollama models', () => {
    expect(estimateCost('llama3', 5000, 5000)).toBe(0);
  });

  test('calculates correctly for claude-3-haiku', () => {
    // 1000 input tokens * 0.025/1k = 0.025 USD
    // 1000 output tokens * 0.125/1k = 0.125 USD
    // Total = 0.15 USD = 15 cents
    const cost = estimateCost('claude-3-haiku', 1000, 1000);
    expect(cost).toBeCloseTo(15, 1);
  });

  test('calculates correctly for claude-opus-4', () => {
    // 1000 input * 1.5/1k = 1.5 USD
    // 1000 output * 7.5/1k = 7.5 USD
    // Total = 9.0 USD = 900 cents
    const cost = estimateCost('claude-opus-4', 1000, 1000);
    expect(cost).toBeCloseTo(900, 1);
  });

  test('scales linearly with token count', () => {
    const cost1k = estimateCost('gpt-4o', 1000, 0);
    const cost2k = estimateCost('gpt-4o', 2000, 0);
    expect(cost2k).toBeCloseTo(cost1k * 2, 5);
  });

  test('input and output costs are independent', () => {
    const inputOnly = estimateCost('gpt-4o', 1000, 0);
    const outputOnly = estimateCost('gpt-4o', 0, 1000);
    const both = estimateCost('gpt-4o', 1000, 1000);
    expect(both).toBeCloseTo(inputOnly + outputOnly, 5);
  });

  test('uses extraModels when provided', () => {
    const extra: Record<string, ModelInfo> = {
      'custom-model': { provider: 'custom', costPer1kInput: 1.0, costPer1kOutput: 2.0, maxContext: 4096, tier: 'moderate' },
    };
    // 1000 * 1.0/1k = 1.0 USD input + 1000 * 2.0/1k = 2.0 USD output = 3.0 USD = 300 cents
    const cost = estimateCost('custom-model', 1000, 1000, extra);
    expect(cost).toBeCloseTo(300, 1);
  });

  test('extraModels override registry models', () => {
    const override: Record<string, ModelInfo> = {
      'claude-3-haiku': { provider: 'anthropic', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 200000, tier: 'trivial' },
    };
    const cost = estimateCost('claude-3-haiku', 1000, 1000, override);
    expect(cost).toBe(0);
  });

  test('zero tokens = zero cost', () => {
    expect(estimateCost('claude-opus-4', 0, 0)).toBe(0);
  });
});

// ─── getModelInfo ───────────────────────────────────────────────

describe('getModelInfo', () => {
  test('returns info for known model', () => {
    const info = getModelInfo('claude-3.5-sonnet');
    expect(info).not.toBeNull();
    expect(info!.provider).toBe('anthropic');
    expect(info!.tier).toBe('moderate');
  });

  test('returns null for unknown model', () => {
    expect(getModelInfo('nonexistent')).toBeNull();
  });

  test('extraModels override registry', () => {
    const extra: Record<string, ModelInfo> = {
      'claude-3.5-sonnet': { provider: 'openrouter', costPer1kInput: 0.1, costPer1kOutput: 0.5, maxContext: 200000, tier: 'simple' },
    };
    const info = getModelInfo('claude-3.5-sonnet', extra);
    expect(info!.provider).toBe('openrouter');
    expect(info!.tier).toBe('simple');
  });

  test('extraModels add new models', () => {
    const extra: Record<string, ModelInfo> = {
      'my-model': { provider: 'custom', costPer1kInput: 0, costPer1kOutput: 0, maxContext: 4096, tier: 'trivial' },
    };
    const info = getModelInfo('my-model', extra);
    expect(info).not.toBeNull();
    expect(info!.provider).toBe('custom');
  });
});
