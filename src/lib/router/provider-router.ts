// ── Layer 3: Provider Router ─────────────────────────────────────
// Model selection, fallback chains, circuit breakers.

import type { ChatProvider, ChatMessage, ChatConfig } from '../providers/types';
import type { RoutingConfig } from './types';

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

  throw lastError ?? new Error(`No available provider for model ${model}`);
}
