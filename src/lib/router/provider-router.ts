// ── Layer 3: Provider Router ─────────────────────────────────────
// Model selection, fallback chains, circuit breakers.
// Privacy-aware: scrubs PII before external calls, enforces fail-closed tokens.

import type { ChatProvider, ChatMessage, ChatConfig } from '../providers/types';
import type { RoutingConfig } from './types';
import type { PrivacyConfig, PrivacyLevel, RedactionMap } from '../privacy/types';
import { scrub, clearRedactions, getRulesForLevel, compileUserRules } from '../privacy/scrubber';
import { getTokenCount, popToken, maybeRefresh } from '../privacy/tokens';

// ── Circuit breaker state (in-memory) ────────────────────────────

interface CircuitState {
  failures: number;
  lastFailure: number;
}

const circuits = new Map<string, CircuitState>();
const CIRCUIT_THRESHOLD = 3;       // failures before opening circuit
const CIRCUIT_RESET_MS = 60_000;   // 60 seconds

function isCircuitOpen(providerId: string): boolean {
  const state = circuits.get(providerId);
  if (!state) return false;

  if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
    circuits.delete(providerId);
    return false;
  }

  return state.failures >= CIRCUIT_THRESHOLD;
}

function recordFailure(providerId: string): void {
  const state = circuits.get(providerId) ?? { failures: 0, lastFailure: 0 };
  state.failures++;
  state.lastFailure = Date.now();
  circuits.set(providerId, state);
}

function recordSuccess(providerId: string): void {
  circuits.delete(providerId);
}

// ── API key cache (populated by router facade on init) ───────────

const apiKeyCache = new Map<string, string>();

/**
 * Register an API key for a provider. Called by the router facade
 * during initialization so provider-router doesn't need config access.
 */
export function registerApiKey(providerId: string, apiKey: string): void {
  apiKeyCache.set(providerId, apiKey);
}

function getApiKeyForProvider(providerId: string): string | undefined {
  // 1. Check cache (populated by router facade)
  const cached = apiKeyCache.get(providerId);
  if (cached) return cached;

  // 2. Check environment variables
  const envMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  const envKey = envMap[providerId];
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }

  // Ollama doesn't need a key
  if (providerId === 'ollama') return undefined;

  return undefined;
}

// ── Privacy Layer ────────────────────────────────────────────────

/** Last redaction map from the most recent privacy-scrubbed request. */
let lastRedactions: RedactionMap | null = null;

/**
 * Get the redaction map from the last privacy-scrubbed request.
 * Use with `restore()` to re-contextualize LLM responses.
 * Returns null if privacy was not active for the last request.
 */
export function getLastRedactionMap(): RedactionMap | null {
  return lastRedactions;
}

function getPrivacyLevel(providerId: string, privacy: PrivacyConfig): PrivacyLevel | 'skip' {
  return privacy.providers[providerId] ?? privacy.level;
}

function scrubMessages(
  messages: ChatMessage[],
  level: PrivacyLevel,
  userRules: PrivacyConfig['rules'],
): { messages: ChatMessage[]; redactions: RedactionMap } {
  const rules = [
    ...getRulesForLevel(level),
    ...compileUserRules(userRules),
  ];
  const result = scrub(messages, rules);
  return { messages: result.messages, redactions: result.redactions };
}

// ── Main router ──────────────────────────────────────────────────

/**
 * Route a request to a specific model/provider, with fallback chain
 * and circuit breaker protection.
 *
 * When `privacy` is provided:
 *   - Messages are scrubbed per the provider's privacy level before sending
 *   - Redaction map is stored (accessible via `getLastRedactionMap()`)
 *   - Fail-closed: if tokens are enabled but exhausted, non-local providers are refused
 */
export async function* routeToProvider(
  model: string,
  providerId: string,
  messages: ChatMessage[],
  config: RoutingConfig,
  providers: Record<string, ChatProvider>,
  privacy?: PrivacyConfig,
): AsyncGenerator<string> {
  // Clear previous redaction map
  if (lastRedactions) {
    clearRedactions(lastRedactions);
    lastRedactions = null;
  }

  // Build the attempt chain: primary provider + fallback chain
  const attemptChain = [providerId, ...config.fallback.chain.filter(p => p !== providerId)];

  // Privacy: check fail-closed token mode
  const tokenModeActive = privacy?.enabled && privacy.tokens?.enabled;
  if (tokenModeActive) {
    // Fire-and-forget refresh if tokens are low
    maybeRefresh(privacy.tokens!).catch(() => {});
  }

  let lastError: Error | null = null;

  for (const pid of attemptChain) {
    // Skip if circuit is open
    if (isCircuitOpen(pid)) continue;

    const provider = providers[pid];
    if (!provider) continue;

    // Determine API key for this provider
    const apiKey = getApiKeyForProvider(pid);
    if (provider.requiresApiKey && !apiKey) continue;

    // Privacy: fail-closed token mode
    // If tokens are enabled but exhausted, refuse non-local providers
    // to prevent identity leakage via raw API key
    if (tokenModeActive && pid !== 'ollama' && getTokenCount() === 0) {
      continue;
    }

    // Privacy: scrub messages for this provider
    let effectiveMessages = messages;
    if (privacy?.enabled) {
      const level = getPrivacyLevel(pid, privacy);
      if (level !== 'skip') {
        const scrubbed = scrubMessages(effectiveMessages, level, privacy.rules);
        effectiveMessages = scrubbed.messages;
        lastRedactions = scrubbed.redactions;
      }
    }

    const chatConfig: ChatConfig = {
      model,
      messages: effectiveMessages,
      apiKey,
      baseUrl: provider.defaultBaseUrl,
    };

    try {
      const stream = provider.chat(chatConfig);
      let yielded = false;

      for await (const token of stream) {
        yielded = true;
        yield token;
      }

      if (yielded) {
        recordSuccess(pid);
        return;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      recordFailure(pid);

      // Retry delay before trying next provider
      if (config.fallback.retryDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, config.fallback.retryDelayMs));
      }
    }
  }

  // Clean up redaction map on failure
  if (lastRedactions) {
    clearRedactions(lastRedactions);
    lastRedactions = null;
  }

  throw lastError ?? new Error(`No available provider for model ${model}`);
}
