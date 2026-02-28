// ── Privacy Layer Types ──────────────────────────────────────────
// Content anonymization + identity unlinkability for external LLM calls.

import type { ChatMessage } from '../providers/types';

// ── Redaction ────────────────────────────────────────────────────

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;  // e.g., "[REDACTED_EMAIL]", "[LOCATION]"
}

/** Map of placeholder ID → original value. Kept in memory only. */
export type RedactionMap = Map<string, string>;

export interface ScrubResult {
  messages: ChatMessage[];
  redactions: RedactionMap;
  stats: {
    totalRedactions: number;
    byRule: Record<string, number>;
  };
}

// ── Configuration ────────────────────────────────────────────────

export type PrivacyLevel = 'minimal' | 'standard' | 'aggressive';
export type ProviderPrivacy = 'skip' | 'minimal' | 'standard' | 'aggressive';

export interface UserRedactionRule {
  name: string;
  pattern: string;        // String form — compiled to RegExp at load time
  replacement: string;
}

export interface PrivacyConfig {
  enabled: boolean;
  level: PrivacyLevel;
  rules: UserRedactionRule[];
  providers: Record<string, ProviderPrivacy>;
  tokens?: TokenConfig;
}

// ── Token Layer (Phase 2) ────────────────────────────────────────

export interface TokenConfig {
  enabled: boolean;
  issuer: 'vouch' | 'self-hosted' | 'openrouter';
  issuerUrl?: string;
  batchSize: number;
  refreshThreshold: number;
}

// ── Defaults ─────────────────────────────────────────────────────

export function getDefaultPrivacyConfig(): PrivacyConfig {
  return {
    enabled: false,
    level: 'standard',
    rules: [],
    providers: {
      ollama: 'skip',
      anthropic: 'standard',
      openai: 'standard',
      openrouter: 'aggressive',
    },
  };
}
