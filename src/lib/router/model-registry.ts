// ── Model Registry ───────────────────────────────────────────────
// Static model catalog with cost data and tier mappings.
// Costs in USD per 1K tokens (as of Feb 2026).

import type { ModelInfo, TaskComplexity, RoutingConfig } from './types';

export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // ── Anthropic ──────────────────────────────────────────────────
  'claude-3-haiku': {
    provider: 'anthropic',
    costPer1kInput: 0.025,
    costPer1kOutput: 0.125,
    maxContext: 200000,
    tier: 'trivial',
  },
  'claude-3.5-haiku': {
    provider: 'anthropic',
    costPer1kInput: 0.08,
    costPer1kOutput: 0.4,
    maxContext: 200000,
    tier: 'simple',
  },
  'claude-3.5-sonnet': {
    provider: 'anthropic',
    costPer1kInput: 0.3,
    costPer1kOutput: 1.5,
    maxContext: 200000,
    tier: 'moderate',
  },
  'claude-sonnet-4': {
    provider: 'anthropic',
    costPer1kInput: 0.3,
    costPer1kOutput: 1.5,
    maxContext: 200000,
    tier: 'moderate',
  },
  'claude-opus-4': {
    provider: 'anthropic',
    costPer1kInput: 1.5,
    costPer1kOutput: 7.5,
    maxContext: 200000,
    tier: 'expert',
  },

  // ── OpenAI ─────────────────────────────────────────────────────
  'gpt-4o-mini': {
    provider: 'openai',
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
    maxContext: 128000,
    tier: 'simple',
  },
  'gpt-4o': {
    provider: 'openai',
    costPer1kInput: 0.25,
    costPer1kOutput: 1.0,
    maxContext: 128000,
    tier: 'moderate',
  },
  'o3-mini': {
    provider: 'openai',
    costPer1kInput: 0.11,
    costPer1kOutput: 0.44,
    maxContext: 200000,
    tier: 'complex',
  },

  // ── Ollama (local, zero cost) ──────────────────────────────────
  'llama3': {
    provider: 'ollama',
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxContext: 8192,
    tier: 'simple',
  },
  'llama3.1': {
    provider: 'ollama',
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxContext: 131072,
    tier: 'moderate',
  },
  'mistral': {
    provider: 'ollama',
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxContext: 32768,
    tier: 'simple',
  },
  'qwen2.5': {
    provider: 'ollama',
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxContext: 131072,
    tier: 'moderate',
  },
};

// ── Tier-ordered preference (cheap -> expensive per tier) ────────

const TIER_ORDER: TaskComplexity[] = ['trivial', 'simple', 'moderate', 'complex', 'expert'];

/**
 * Get the best model for a given complexity level.
 * Looks at the user's routing config models first, then falls back to registry.
 * Prefers the cheapest model at or above the required tier.
 */
export function getModelForComplexity(
  complexity: TaskComplexity,
  config: RoutingConfig,
): { model: string; provider: string } {
  const targetTierIdx = TIER_ORDER.indexOf(complexity);

  // If user has configured custom models, prefer those exclusively.
  // Only fall back to default registry if no user models are configured.
  const hasUserModels = Object.keys(config.models).length > 0;
  const allModels = hasUserModels ? config.models : MODEL_REGISTRY;

  // Find models at or above the required tier, sorted by cost (cheapest first)
  const candidates: Array<{ model: string; info: ModelInfo; tierIdx: number }> = [];

  for (const [model, info] of Object.entries(allModels)) {
    const modelTierIdx = TIER_ORDER.indexOf(info.tier);
    if (modelTierIdx >= targetTierIdx) {
      candidates.push({ model, info, tierIdx: modelTierIdx });
    }
  }

  // Sort: closest tier first, then cheapest within same tier
  candidates.sort((a, b) => {
    if (a.tierIdx !== b.tierIdx) return a.tierIdx - b.tierIdx;
    return (a.info.costPer1kInput + a.info.costPer1kOutput)
      - (b.info.costPer1kInput + b.info.costPer1kOutput);
  });

  if (candidates.length > 0) {
    return { model: candidates[0].model, provider: candidates[0].info.provider };
  }

  // Absolute fallback
  return { model: 'claude-3.5-sonnet', provider: 'anthropic' };
}

/**
 * Estimate cost in cents for a given model and token counts.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  extraModels?: Record<string, ModelInfo>,
): number {
  const allModels = { ...MODEL_REGISTRY, ...extraModels };
  const info = allModels[model];
  if (!info) return 0;

  const inputCost = (inputTokens / 1000) * info.costPer1kInput;
  const outputCost = (outputTokens / 1000) * info.costPer1kOutput;
  return (inputCost + outputCost) * 100; // Convert to cents
}

/**
 * Get model info, checking user config overrides first.
 */
export function getModelInfo(
  model: string,
  extraModels?: Record<string, ModelInfo>,
): ModelInfo | null {
  const allModels = { ...MODEL_REGISTRY, ...extraModels };
  return allModels[model] ?? null;
}
