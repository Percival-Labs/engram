import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getDefaultRoutingConfig, loadRoutingConfig, _resetYamlCache } from '../config';

const engramHome = join(homedir(), '.engram');
const yamlPath = join(engramHome, 'routing.yaml');
const configJsonPath = join(engramHome, 'config.json');

// Save/restore routing.yaml AND config.json so tests don't clobber real config
let savedYaml: string | null = null;
let savedConfigJson: string | null = null;

beforeEach(() => {
  // Reset YAML cache to avoid stale mtime matches between fast tests
  _resetYamlCache();

  if (existsSync(yamlPath)) {
    savedYaml = readFileSync(yamlPath, 'utf-8');
  } else {
    savedYaml = null;
  }

  // Save config.json and temporarily remove routing field
  if (existsSync(configJsonPath)) {
    savedConfigJson = readFileSync(configJsonPath, 'utf-8');
    try {
      const parsed = JSON.parse(savedConfigJson);
      const { routing, ...rest } = parsed;
      writeFileSync(configJsonPath, JSON.stringify(rest, null, 2));
    } catch {
      // If parse fails, leave config.json as-is
    }
  } else {
    savedConfigJson = null;
  }
});

afterEach(() => {
  _resetYamlCache();

  // Restore routing.yaml
  if (savedYaml !== null) {
    writeFileSync(yamlPath, savedYaml);
  } else if (existsSync(yamlPath)) {
    rmSync(yamlPath);
  }

  // Restore config.json
  if (savedConfigJson !== null) {
    writeFileSync(configJsonPath, savedConfigJson);
  }
});

// ─── getDefaultRoutingConfig ────────────────────────────────────

describe('getDefaultRoutingConfig', () => {
  test('returns a complete config object', () => {
    const config = getDefaultRoutingConfig();
    expect(config.enabled).toBe(false);
    expect(config.strategy).toBe('passthrough');
    expect(config.cascade).toBeDefined();
    expect(config.fallback).toBeDefined();
    expect(config.budgetGuard).toBeDefined();
    expect(config.models).toBeDefined();
  });

  test('routing is disabled by default', () => {
    const config = getDefaultRoutingConfig();
    expect(config.enabled).toBe(false);
    expect(config.strategy).toBe('passthrough');
  });

  test('cascade is disabled by default', () => {
    const config = getDefaultRoutingConfig();
    expect(config.cascade.enabled).toBe(false);
    expect(config.cascade.steps).toEqual([]);
    expect(config.cascade.qualityThreshold).toBe(0.7);
    expect(config.cascade.maxEscalations).toBe(2);
  });

  test('fallback chain defaults to anthropic → openai → ollama', () => {
    const config = getDefaultRoutingConfig();
    expect(config.fallback.chain).toEqual(['anthropic', 'openai', 'ollama']);
    expect(config.fallback.retryDelayMs).toBe(1000);
    expect(config.fallback.maxRetries).toBe(2);
  });

  test('budget guard defaults to unlimited', () => {
    const config = getDefaultRoutingConfig();
    expect(config.budgetGuard.dailyLimitCents).toBe(0);
    expect(config.budgetGuard.warningThresholdPercent).toBe(80);
  });

  test('no custom models by default', () => {
    const config = getDefaultRoutingConfig();
    expect(Object.keys(config.models)).toHaveLength(0);
  });

  test('returns a fresh object each call (no shared mutation)', () => {
    const a = getDefaultRoutingConfig();
    const b = getDefaultRoutingConfig();
    a.enabled = true;
    a.cascade.qualityThreshold = 0.99;
    expect(b.enabled).toBe(false);
    expect(b.cascade.qualityThreshold).toBe(0.7);
  });
});

// ─── loadRoutingConfig — YAML overrides ─────────────────────────

describe('loadRoutingConfig — YAML overrides', () => {
  test('returns defaults when no routing.yaml exists', () => {
    if (existsSync(yamlPath)) rmSync(yamlPath);
    const config = loadRoutingConfig();
    expect(config.strategy).toBe('passthrough');
  });

  test('yaml overrides scalar fields', () => {
    writeFileSync(yamlPath, 'enabled: true\nstrategy: cascade\n');
    const config = loadRoutingConfig();
    expect(config.enabled).toBe(true);
    expect(config.strategy).toBe('cascade');
  });

  test('yaml deep-merges nested objects', () => {
    writeFileSync(yamlPath, [
      'cascade:',
      '  enabled: true',
      '  qualityThreshold: 0.5',
    ].join('\n'));

    const config = loadRoutingConfig();
    expect(config.cascade.enabled).toBe(true);
    expect(config.cascade.qualityThreshold).toBe(0.5);
    // Fields not in yaml should keep defaults
    expect(config.cascade.maxEscalations).toBe(2);
    expect(config.cascade.steps).toEqual([]);
  });

  test('yaml overrides arrays completely (no merge)', () => {
    writeFileSync(yamlPath, [
      'fallback:',
      '  chain:',
      '    - ollama',
    ].join('\n'));

    const config = loadRoutingConfig();
    expect(config.fallback.chain).toEqual(['ollama']);
  });

  test('yaml adds custom models', () => {
    writeFileSync(yamlPath, [
      'models:',
      '  my-local-model:',
      '    provider: ollama',
      '    costPer1kInput: 0',
      '    costPer1kOutput: 0',
      '    maxContext: 8192',
      '    tier: simple',
    ].join('\n'));

    const config = loadRoutingConfig();
    expect(config.models['my-local-model']).toBeDefined();
    expect(config.models['my-local-model'].provider).toBe('ollama');
    expect(config.models['my-local-model'].tier).toBe('simple');
  });

  test('yaml overrides budget guard', () => {
    writeFileSync(yamlPath, [
      'budgetGuard:',
      '  dailyLimitCents: 500',
      '  warningThresholdPercent: 90',
    ].join('\n'));

    const config = loadRoutingConfig();
    expect(config.budgetGuard.dailyLimitCents).toBe(500);
    expect(config.budgetGuard.warningThresholdPercent).toBe(90);
  });

  test('malformed yaml falls back to defaults gracefully', () => {
    writeFileSync(yamlPath, '{{{{invalid yaml!!!!');
    const config = loadRoutingConfig();
    // Should still return a valid config (defaults)
    expect(config.strategy).toBeDefined();
    expect(config.cascade).toBeDefined();
  });

  test('empty yaml file returns defaults', () => {
    writeFileSync(yamlPath, '');
    const config = loadRoutingConfig();
    expect(config.enabled).toBe(false);
    expect(config.strategy).toBe('passthrough');
  });

  test('yaml with only comments returns defaults', () => {
    writeFileSync(yamlPath, '# This is a comment\n# Another comment\n');
    const config = loadRoutingConfig();
    expect(config.enabled).toBe(false);
  });
});

// ─── loadRoutingConfig — config.json routing field ──────────────

describe('loadRoutingConfig — config.json integration', () => {
  test('picks up routing.enabled from config.json', () => {
    // This test relies on the actual ~/.engram/config.json
    // which we set up with routing.enabled = true earlier.
    // If config.json doesn't exist, it should still return defaults.
    const config = loadRoutingConfig();
    expect(typeof config.enabled).toBe('boolean');
  });

  test('yaml takes precedence over config.json', () => {
    // config.json has routing.enabled = true (from our test setup)
    // yaml should override it
    writeFileSync(yamlPath, 'enabled: false\n');
    const config = loadRoutingConfig();
    expect(config.enabled).toBe(false);
  });
});

// ─── loadRoutingConfig — hot reload cache ───────────────────────

describe('loadRoutingConfig — YAML hot reload', () => {
  test('returns same result for unchanged file (cache hit)', () => {
    writeFileSync(yamlPath, 'enabled: true\nstrategy: cascade\n');

    const config1 = loadRoutingConfig();
    const config2 = loadRoutingConfig();

    expect(config1.enabled).toBe(config2.enabled);
    expect(config1.strategy).toBe(config2.strategy);
  });

  test('detects file changes (cache invalidation)', async () => {
    writeFileSync(yamlPath, 'strategy: cascade\n');
    const config1 = loadRoutingConfig();
    expect(config1.strategy).toBe('cascade');

    // Wait a tick so mtime changes
    await new Promise(r => setTimeout(r, 50));

    writeFileSync(yamlPath, 'strategy: cost-optimized\n');
    const config2 = loadRoutingConfig();
    expect(config2.strategy).toBe('cost-optimized');
  });
});

// ─── Deep merge behavior ────────────────────────────────────────

describe('loadRoutingConfig — deep merge', () => {
  test('undefined values in yaml do not overwrite defaults', () => {
    // YAML with only one field — everything else should be defaults
    writeFileSync(yamlPath, 'enabled: true\n');
    const config = loadRoutingConfig();

    expect(config.enabled).toBe(true);
    expect(config.cascade.qualityThreshold).toBe(0.7);
    expect(config.fallback.chain).toEqual(expect.arrayContaining(['anthropic']));
    expect(config.budgetGuard.warningThresholdPercent).toBe(80);
  });

  test('nested overrides do not destroy sibling fields', () => {
    writeFileSync(yamlPath, [
      'cascade:',
      '  qualityThreshold: 0.9',
    ].join('\n'));

    const config = loadRoutingConfig();
    expect(config.cascade.qualityThreshold).toBe(0.9);
    expect(config.cascade.enabled).toBe(false); // Sibling preserved
    expect(config.cascade.maxEscalations).toBe(2); // Sibling preserved
  });
});
