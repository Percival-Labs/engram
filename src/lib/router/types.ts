// ── Smart Routing Layer Types ────────────────────────────────────
// All routing types in one place. Zero dependencies.

import type { ChatMessage } from '../providers/types';

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

export interface ClassificationSignals {
  entropy: number;        // Shannon entropy of input
  cognitiveVerbs: number; // Count of analyze/compare/design/etc.
  clauseDepth: number;    // Nested clause count
  codeDetected: boolean;
  avgWordLength: number;
  tokenEstimate: number;  // chars / 4
}

export interface ClassificationResult {
  complexity: TaskComplexity;
  signals: ClassificationSignals;
  confidence: number;     // 0-1
}

export interface CascadeStep {
  model: string;
  provider: string;
  maxTokens?: number;
}

export interface CascadeResult {
  response: string;
  model: string;
  provider: string;
  attempts: CascadeStep[];
  escalated: boolean;
  tokensUsed: number;
  costCents: number;
}

export interface QualityCheck {
  pass: boolean;
  score: number;
  reasons: string[];
}

export interface ModelInfo {
  provider: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxContext: number;
  tier: TaskComplexity;
}

export interface RoutingConfig {
  enabled: boolean;
  strategy: 'passthrough' | 'cascade' | 'cost-optimized';
  cascade: {
    enabled: boolean;
    steps: CascadeStep[];        // Ordered cheap -> expensive
    qualityThreshold: number;    // 0-1, default 0.7
    maxEscalations: number;      // default 2
  };
  fallback: {
    chain: string[];             // provider IDs in order
    retryDelayMs: number;
    maxRetries: number;
  };
  budgetGuard: {
    dailyLimitCents: number;
    warningThresholdPercent: number;
  };
  models: Record<string, ModelInfo>;
}

export interface UsageEntry {
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  complexity: TaskComplexity;
  escalated: boolean;
  latencyMs: number;
}

export interface UsageSummary {
  totalCostCents: number;
  totalTokens: number;
  requestCount: number;
  modelBreakdown: Record<string, {
    requests: number;
    tokens: number;
    costCents: number;
  }>;
}

export interface RoutingInfo {
  model: string;
  provider: string;
  costCents: number;
  escalated: boolean;
  complexity: TaskComplexity;
  latencyMs: number;
}
