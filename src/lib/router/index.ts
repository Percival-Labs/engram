// ── Engram Router — Entry Point ──────────────────────────────────
// Single facade for the 3-layer routing system.
// Passthrough when routing is disabled (zero overhead).

import type { ChatProvider, ChatConfig, ChatMessage } from '../providers/types';
import type { RoutingConfig, CascadeResult, RoutingInfo, TaskComplexity } from './types';
import { classifyTask } from './classifier';
import { executeCascade, lastCascadeResult } from './cascade';
import { routeToProvider, registerApiKey, getLastRedactionMap } from './provider-router';
import type { PrivacyConfig } from '../privacy/types';
import { scrub, restore, clearRedactions, getRulesForLevel, compileUserRules } from '../privacy/scrubber';
import { getModelForComplexity, estimateCost } from './model-registry';
import { logUsage, getTodayCostCents } from './usage-tracker';

export class EngramRouter {
  private lastInfo: RoutingInfo | null = null;
  private privacyConfig?: PrivacyConfig;

  constructor(
    private config: RoutingConfig,
    private providers: Record<string, ChatProvider>,
    apiKeys?: Record<string, string>,
    privacy?: PrivacyConfig,
  ) {
    // Pre-register API keys so provider-router can use them
    if (apiKeys) {
      for (const [pid, key] of Object.entries(apiKeys)) {
        registerApiKey(pid, key);
      }
    }
    this.privacyConfig = privacy;
  }

  /**
   * Main entry point. Routes a chat request through the 3-layer system.
   * In passthrough mode, delegates directly to the provider like today.
   */
  async *chat(chatConfig: ChatConfig): AsyncGenerator<string> {
    const startTime = Date.now();

    // ── Passthrough mode ─────────────────────────────────────────
    if (!this.config.enabled || this.config.strategy === 'passthrough') {
      yield* this.passthroughChat(chatConfig);
      return;
    }

    // ── Budget guard ─────────────────────────────────────────────
    if (this.config.budgetGuard.dailyLimitCents > 0) {
      const todayCost = getTodayCostCents();
      if (todayCost >= this.config.budgetGuard.dailyLimitCents) {
        throw new Error(
          `Daily budget limit reached ($${(todayCost / 100).toFixed(2)} / $${(this.config.budgetGuard.dailyLimitCents / 100).toFixed(2)}). ` +
          'Resets at midnight. Override with routing.yaml budgetGuard.dailyLimitCents: 0'
        );
      }
    }

    // ── Layer 1: Classify ────────────────────────────────────────
    const classification = classifyTask(chatConfig.messages);

    // ── Layer 2: Cascade (if enabled) ────────────────────────────
    if (this.config.cascade.enabled) {
      yield* executeCascade(
        chatConfig.messages,
        classification,
        this.config,
        this.providers,
      );

      // Log result
      const result = lastCascadeResult;
      if (result) {
        this.recordUsage(result, classification.complexity, startTime);
      }
      return;
    }

    // ── Direct routing (no cascade) ──────────────────────────────
    const target = getModelForComplexity(classification.complexity, this.config);
    let fullResponse = '';

    const stream = routeToProvider(
      target.model, target.provider, chatConfig.messages, this.config, this.providers,
      this.privacyConfig,
    );

    for await (const token of stream) {
      fullResponse += token;
      yield token;
    }

    // Privacy: restore redacted values in the full response if configured
    if (this.privacyConfig?.enabled && this.privacyConfig.restoreResponses !== false) {
      const redactions = getLastRedactionMap();
      if (redactions && redactions.size > 0) {
        restore(fullResponse, redactions);
      }
    }

    // Log usage
    const latencyMs = Date.now() - startTime;
    const inputTokens = Math.ceil(chatConfig.messages.map(m => m.content).join('').length / 4);
    const outputTokens = Math.ceil(fullResponse.length / 4);
    const costCents = estimateCost(target.model, inputTokens, outputTokens, this.config.models);

    this.lastInfo = {
      model: target.model,
      provider: target.provider,
      costCents,
      escalated: false,
      complexity: classification.complexity,
      latencyMs,
    };

    logUsage({
      timestamp: new Date().toISOString(),
      model: target.model,
      provider: target.provider,
      inputTokens,
      outputTokens,
      costCents,
      complexity: classification.complexity,
      escalated: false,
      latencyMs,
    });
  }

  /**
   * Get routing info from the last request (for display).
   */
  getLastRoutingInfo(): RoutingInfo | null {
    // Check cascade result first
    if (lastCascadeResult) {
      return this.lastInfo;
    }
    return this.lastInfo;
  }

  /**
   * Get the last cascade result (for detailed reporting).
   */
  getLastCascadeResult(): CascadeResult | null {
    return lastCascadeResult;
  }

  // ── Internal helpers ───────────────────────────────────────────

  private async *passthroughChat(chatConfig: ChatConfig): AsyncGenerator<string> {
    // Find the provider from the chatConfig context
    const providerId = this.resolveProviderId(chatConfig);
    const provider = this.providers[providerId];

    if (!provider) {
      throw new Error(`Provider '${providerId}' not available for passthrough`);
    }

    // Privacy: scrub messages even in passthrough mode
    let effectiveConfig = chatConfig;
    if (this.privacyConfig?.enabled) {
      const level = this.privacyConfig.providers[providerId] ?? this.privacyConfig.level;
      if (level !== 'skip') {
        const rules = [
          ...getRulesForLevel(level),
          ...compileUserRules(this.privacyConfig.rules),
        ];
        const { messages: scrubbed } = scrub(chatConfig.messages, rules);
        effectiveConfig = { ...chatConfig, messages: scrubbed };
      }
    }

    yield* provider.chat(effectiveConfig);
  }

  private resolveProviderId(chatConfig: ChatConfig): string {
    // Try to match by base URL or API key pattern
    if (chatConfig.baseUrl?.includes('anthropic')) return 'anthropic';
    if (chatConfig.baseUrl?.includes('openai.com')) return 'openai';
    if (chatConfig.baseUrl?.includes('openrouter')) return 'openrouter';
    if (chatConfig.baseUrl?.includes('localhost:11434')) return 'ollama';

    // Fallback: check which provider has this model
    for (const [id, provider] of Object.entries(this.providers)) {
      if (id === 'ollama' && !chatConfig.apiKey) continue;
      if (provider.requiresApiKey && chatConfig.apiKey) return id;
    }

    return 'anthropic'; // Default
  }

  private recordUsage(
    result: CascadeResult,
    complexity: TaskComplexity,
    startTime: number,
  ): void {
    const latencyMs = Date.now() - startTime;
    const inputTokens = Math.ceil(result.response.length / 4); // Rough estimate
    const outputTokens = result.tokensUsed;
    const costCents = estimateCost(result.model, inputTokens, outputTokens, this.config.models);

    this.lastInfo = {
      model: result.model,
      provider: result.provider,
      costCents,
      escalated: result.escalated,
      complexity,
      latencyMs,
    };

    logUsage({
      timestamp: new Date().toISOString(),
      model: result.model,
      provider: result.provider,
      inputTokens,
      outputTokens,
      costCents,
      complexity,
      escalated: result.escalated,
      latencyMs,
    });
  }
}

// ── Re-exports for convenience ───────────────────────────────────

export { classifyTask } from './classifier';
export { loadRoutingConfig, getDefaultRoutingConfig } from './config';
export { getModelForComplexity, estimateCost, MODEL_REGISTRY } from './model-registry';
export { logUsage, getDailyUsage, getDailySummary, getUsageRange } from './usage-tracker';
export { validateResponse } from './quality';
export { getLastRedactionMap } from './provider-router';
export type { RoutingConfig, RoutingInfo, CascadeResult, TaskComplexity, UsageEntry, UsageSummary } from './types';
