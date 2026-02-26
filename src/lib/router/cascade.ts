// ── Layer 2: Cascade Executor ────────────────────────────────────
// Try cheap model first, validate quality, escalate if insufficient.
// Buffers the first response to check quality before yielding.

import type { ChatMessage } from '../providers/types';
import type { ClassificationResult, RoutingConfig, CascadeResult, CascadeStep } from './types';
import { getModelForComplexity } from './model-registry';
import { validateResponse } from './quality';
import { routeToProvider } from './provider-router';

/**
 * Execute the cascade strategy:
 * 1. Pick cheapest model for the classified complexity
 * 2. Get full response (buffered)
 * 3. Run quality check
 * 4. If quality passes → yield the buffered response
 * 5. If quality fails → escalate to next tier and stream that response
 *
 * Returns an AsyncGenerator that yields string tokens.
 * Also populates lastCascadeResult for post-response reporting.
 */
export let lastCascadeResult: CascadeResult | null = null;

export async function* executeCascade(
  messages: ChatMessage[],
  classification: ClassificationResult,
  config: RoutingConfig,
  providers: Record<string, import('../providers/types').ChatProvider>,
): AsyncGenerator<string> {
  const attempts: CascadeStep[] = [];
  const maxEscalations = config.cascade.maxEscalations;
  const qualityThreshold = config.cascade.qualityThreshold;
  const startTime = Date.now();

  // Determine starting tier — use classification result
  const tiers = ['trivial', 'simple', 'moderate', 'complex', 'expert'] as const;
  let currentTierIdx = tiers.indexOf(classification.complexity);

  // If cascade steps are explicitly configured, use those
  if (config.cascade.steps.length > 0) {
    yield* executeCascadeWithExplicitSteps(
      messages, config, providers, attempts, startTime, qualityThreshold,
    );
    return;
  }

  // Dynamic cascade: start at classified tier, escalate on quality failure
  let escalations = 0;
  let lastQuery = messages.filter(m => m.role === 'user').pop()?.content ?? '';

  while (escalations <= maxEscalations && currentTierIdx < tiers.length) {
    const tier = tiers[currentTierIdx];
    const target = getModelForComplexity(tier, config);

    attempts.push({ model: target.model, provider: target.provider });

    try {
      // Buffer the full response for quality checking
      let buffered = '';
      const stream = routeToProvider(
        target.model, target.provider, messages, config, providers,
      );

      for await (const token of stream) {
        buffered += token;
      }

      // Quality check
      const quality = validateResponse(lastQuery, buffered, classification.complexity);

      if (quality.pass || quality.score >= qualityThreshold || escalations >= maxEscalations) {
        // Quality OK or no more escalations — yield the buffered response
        const latencyMs = Date.now() - startTime;
        const tokenEstimate = Math.ceil(buffered.length / 4);

        lastCascadeResult = {
          response: buffered,
          model: target.model,
          provider: target.provider,
          attempts,
          escalated: escalations > 0,
          tokensUsed: tokenEstimate,
          costCents: 0, // Calculated by caller using model-registry
        };

        // Yield the buffered content as a single chunk
        yield buffered;
        return;
      }

      // Quality insufficient — escalate
      escalations++;
      currentTierIdx++;

    } catch (err) {
      // Provider error — try escalating
      escalations++;
      currentTierIdx++;

      if (currentTierIdx >= tiers.length) {
        throw err; // No more tiers to try
      }
    }
  }

  // Should not reach here, but safety: throw
  throw new Error('Cascade exhausted all tiers without producing a response');
}

/**
 * Execute cascade with explicitly configured steps (from routing.yaml).
 */
async function* executeCascadeWithExplicitSteps(
  messages: ChatMessage[],
  config: RoutingConfig,
  providers: Record<string, import('../providers/types').ChatProvider>,
  attempts: CascadeStep[],
  startTime: number,
  qualityThreshold: number,
): AsyncGenerator<string> {
  const steps = config.cascade.steps;
  const lastQuery = messages.filter(m => m.role === 'user').pop()?.content ?? '';
  const complexity = 'moderate' as const; // Use moderate as baseline for explicit steps

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    attempts.push(step);

    try {
      let buffered = '';
      const stream = routeToProvider(
        step.model, step.provider, messages, config, providers,
      );

      for await (const token of stream) {
        buffered += token;
      }

      const quality = validateResponse(lastQuery, buffered, complexity);

      if (quality.pass || quality.score >= qualityThreshold || i === steps.length - 1) {
        const tokenEstimate = Math.ceil(buffered.length / 4);

        lastCascadeResult = {
          response: buffered,
          model: step.model,
          provider: step.provider,
          attempts,
          escalated: i > 0,
          tokensUsed: tokenEstimate,
          costCents: 0,
        };

        yield buffered;
        return;
      }
    } catch {
      // Step failed — try next step
      if (i === steps.length - 1) {
        throw new Error('Cascade exhausted all configured steps');
      }
    }
  }
}
