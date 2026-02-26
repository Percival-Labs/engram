// ── Routing Config Loader ────────────────────────────────────────
// Cascading config: defaults + config.json routing field + routing.yaml

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { getEngramHome, loadConfig } from '../config';
import type { RoutingConfig } from './types';

// ── Defaults ─────────────────────────────────────────────────────

export function getDefaultRoutingConfig(): RoutingConfig {
  return {
    enabled: false,
    strategy: 'passthrough',
    cascade: {
      enabled: false,
      steps: [],
      qualityThreshold: 0.7,
      maxEscalations: 2,
    },
    fallback: {
      chain: ['anthropic', 'openai', 'ollama'],
      retryDelayMs: 1000,
      maxRetries: 2,
    },
    budgetGuard: {
      dailyLimitCents: 0, // 0 = unlimited
      warningThresholdPercent: 80,
    },
    models: {},
  };
}

// ── YAML hot-reload cache ────────────────────────────────────────

let yamlCache: { mtime: number; config: Partial<RoutingConfig> } | null = null;

/** Reset the YAML cache (for testing). */
export function _resetYamlCache(): void {
  yamlCache = null;
}

function loadYamlOverrides(): Partial<RoutingConfig> {
  const yamlPath = join(getEngramHome(), 'routing.yaml');
  if (!existsSync(yamlPath)) return {};

  const stat = statSync(yamlPath);
  const mtime = stat.mtimeMs;

  // Return cached if file hasn't changed
  if (yamlCache && yamlCache.mtime === mtime) {
    return yamlCache.config;
  }

  try {
    const raw = readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(raw) as Partial<RoutingConfig> | null;
    const config = parsed ?? {};
    yamlCache = { mtime, config };
    return config;
  } catch (err) {
    console.error(`[Router] Failed to parse routing.yaml: ${err}`);
    return {};
  }
}

// ── Deep merge utility ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      targetVal !== null
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

// ── Main loader ──────────────────────────────────────────────────

export function loadRoutingConfig(): RoutingConfig {
  const defaults = getDefaultRoutingConfig();

  // Layer 1: config.json routing field
  let jsonOverrides: Partial<RoutingConfig> = {};
  try {
    const engramConfig = loadConfig();
    if (engramConfig.routing && typeof engramConfig.routing === 'object') {
      jsonOverrides = engramConfig.routing as unknown as Partial<RoutingConfig>;
    }
  } catch {
    // No config or parse error — use defaults
  }

  // Layer 2: routing.yaml (advanced overrides, hot-reloaded)
  const yamlOverrides = loadYamlOverrides();

  // Merge: defaults <- config.json <- routing.yaml
  return deepMerge(deepMerge(defaults, jsonOverrides), yamlOverrides) as RoutingConfig;
}
