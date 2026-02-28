// ── Layer 3: Provider Router ─────────────────────────────────────
// Model selection, fallback chains, circuit breakers, privacy layer.

import type { ChatProvider, ChatMessage, ChatConfig } from '../providers/types';
import type { RoutingConfig } from './types';
import type { PrivacyConfig, RedactionMap, TokenConfig } from '../privacy/types';
import { scrub, restore, getRulesForLevel, compileUserRules } from '../privacy/scrubber';
import type { ProviderPrivacy } from '../privacy/types';
import { popToken, needsRefresh, maybeRefresh, getTokenCount } from '../privacy/tokens';

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

// ── Main router ──────────────────────────────────────────────────

/**
 * Route a request to a specific model/provider, with fallback chain
 * and circuit breaker protection.
 */
export async function* routeToProvider(
  model: string,
  providerId: string,
  messages: ChatMessage[],
  config: RoutingConfig,
  providers: Record<string, ChatProvider>,
): AsyncGenerator<string> {
  // Build the attempt chain: primary provider + fallback chain
  const attemptChain = [providerId, ...config.fallback.chain.filter(p => p !== providerId)];

  let lastError: Error | null = null;

  for (const pid of attemptChain) {
    // Skip if circuit is open
    if (isCircuitOpen(pid)) continue;

    const provider = providers[pid];
    if (!provider) continue;

    // Determine API key for this provider
    const apiKey = getApiKeyForProvider(pid);
    if (provider.requiresApiKey && !apiKey) continue;

    const chatConfig: ChatConfig = {
      model,
      messages,
      apiKey,
      baseUrl: provider.defaultBaseUrl,
    };

    // ── Privacy Layer ──────────────────────────────────────────
    // Strip PII from messages before external API calls.
    // Local providers (Ollama, anything without requiresApiKey) bypass.
    const privacy = config.privacy;
    let effectiveConfig = chatConfig;
    let redactions: RedactionMap | null = null;

    if (privacy?.enabled && provider.requiresApiKey) {
      const providerLevel = privacy.providers[pid] as ProviderPrivacy | undefined;
      if (providerLevel !== 'skip') {
        const level = providerLevel ?? privacy.level;
        const rules = [
          ...getRulesForLevel(level),
          ...compileUserRules(privacy.rules),
        ];
        const result = scrub(chatConfig.messages, rules);
        effectiveConfig = { ...chatConfig, messages: result.messages };
        redactions = result.redactions;
      }
    }

    // ── Token Layer (Phase 2) ──────────────────────────────────────
    // If blind-signed tokens are enabled, route through PL proxy
    // instead of sending the user's API key directly.
    const tokenConfig = privacy?.tokens;
    if (tokenConfig?.enabled && provider.requiresApiKey) {
      const token = popToken();
      if (token) {
        const proxyUrl = resolveProxyUrl(tokenConfig, pid);
        if (proxyUrl) {
          effectiveConfig = {
            ...effectiveConfig,
            baseUrl: proxyUrl,
            apiKey: Buffer.from(token).toString('base64'),
          };
        }
      }
      // Fire-and-forget background refresh
      maybeRefresh(tokenConfig).catch(() => {});
    }

    try {
      const stream = provider.chat(effectiveConfig);
      let yielded = false;

      for await (const token of stream) {
        yielded = true;
        // Re-contextualize response if we scrubbed outbound
        yield redactions ? restore(token, redactions) : token;
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

  throw lastError ?? new Error(`No available provider for model ${model}`);
}

// ── Proxy URL Resolution ──────────────────────────────────────────

const VOUCH_PROXY_BASE = 'https://percivalvouch-api-production.up.railway.app/v1/proxy';

/**
 * Resolve the proxy URL for a provider when using blind-signed tokens.
 * The proxy holds master API keys — users present tokens instead.
 */
function resolveProxyUrl(config: TokenConfig, providerId: string): string | null {
  switch (config.issuer) {
    case 'vouch':
      return `${VOUCH_PROXY_BASE}/${providerId}`;
    case 'self-hosted':
      return config.issuerUrl ? `${config.issuerUrl}/proxy/${providerId}` : null;
    case 'openrouter':
      return null; // Not yet implemented
    default:
      return null;
  }
}
