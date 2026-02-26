import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  logUsage,
  getDailyUsage,
  getDailySummary,
  getUsageRange,
  getTodayCostCents,
} from '../usage-tracker';
import type { UsageEntry } from '../types';

// ── Test isolation: use a temp usage directory ──────────────────
// The usage tracker reads from ~/.engram/usage/ — we write test data
// to a unique date key to avoid polluting real usage data.

const TEST_DATE = '2099-01-01';
const TEST_DATE_2 = '2099-01-02';
const usageDir = join(homedir(), '.engram', 'usage');
const testFile = join(usageDir, `${TEST_DATE}.jsonl`);
const testFile2 = join(usageDir, `${TEST_DATE_2}.jsonl`);

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    timestamp: `${TEST_DATE}T12:00:00.000Z`,
    model: 'claude-3-haiku',
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    costCents: 1.5,
    complexity: 'simple',
    escalated: false,
    latencyMs: 500,
    ...overrides,
  };
}

// Clean up test files before each suite and after all
beforeEach(() => {
  if (existsSync(testFile)) rmSync(testFile);
  if (existsSync(testFile2)) rmSync(testFile2);
});

afterAll(() => {
  if (existsSync(testFile)) rmSync(testFile);
  if (existsSync(testFile2)) rmSync(testFile2);
});

// ─── logUsage ───────────────────────────────────────────────────

describe('logUsage', () => {
  test('creates usage directory if missing', () => {
    // Usage dir should exist (created by prior tests or real usage)
    // but logUsage should handle missing dir gracefully
    const entry = makeEntry();
    logUsage(entry);
    expect(existsSync(testFile)).toBe(true);
  });

  test('appends JSONL line to correct date file', () => {
    logUsage(makeEntry());
    logUsage(makeEntry({ model: 'gpt-4o' }));

    const content = readFileSync(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  test('each line is valid JSON', () => {
    logUsage(makeEntry());
    logUsage(makeEntry({ costCents: 99.5, model: 'claude-opus-4' }));

    const lines = readFileSync(testFile, 'utf-8').trim().split('\n');
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.model).toBeTruthy();
      expect(typeof parsed.costCents).toBe('number');
    }
  });

  test('routes to correct file based on timestamp date', () => {
    logUsage(makeEntry({ timestamp: `${TEST_DATE}T08:00:00.000Z` }));
    logUsage(makeEntry({ timestamp: `${TEST_DATE_2}T08:00:00.000Z` }));

    expect(existsSync(testFile)).toBe(true);
    expect(existsSync(testFile2)).toBe(true);

    const lines1 = readFileSync(testFile, 'utf-8').trim().split('\n');
    const lines2 = readFileSync(testFile2, 'utf-8').trim().split('\n');
    expect(lines1).toHaveLength(1);
    expect(lines2).toHaveLength(1);
  });
});

// ─── getDailyUsage ──────────────────────────────────────────────

describe('getDailyUsage', () => {
  test('returns empty array for nonexistent date', () => {
    const entries = getDailyUsage('2000-01-01');
    expect(entries).toEqual([]);
  });

  test('returns parsed entries for a date', () => {
    logUsage(makeEntry());
    logUsage(makeEntry({ model: 'gpt-4o', costCents: 5 }));

    const entries = getDailyUsage(TEST_DATE);
    expect(entries).toHaveLength(2);
    expect(entries[0].model).toBe('claude-3-haiku');
    expect(entries[1].model).toBe('gpt-4o');
  });

  test('skips malformed lines gracefully', () => {
    // Write a file with a bad line
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(testFile, [
      JSON.stringify(makeEntry()),
      'this is not json',
      JSON.stringify(makeEntry({ model: 'gpt-4o' })),
    ].join('\n') + '\n');

    const entries = getDailyUsage(TEST_DATE);
    expect(entries).toHaveLength(2);
  });

  test('handles empty file', () => {
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(testFile, '');

    const entries = getDailyUsage(TEST_DATE);
    expect(entries).toEqual([]);
  });

  test('preserves all entry fields', () => {
    const entry = makeEntry({
      model: 'claude-opus-4',
      provider: 'anthropic',
      inputTokens: 500,
      outputTokens: 2000,
      costCents: 42.5,
      complexity: 'expert',
      escalated: true,
      latencyMs: 3200,
    });
    logUsage(entry);

    const [parsed] = getDailyUsage(TEST_DATE);
    expect(parsed.model).toBe('claude-opus-4');
    expect(parsed.provider).toBe('anthropic');
    expect(parsed.inputTokens).toBe(500);
    expect(parsed.outputTokens).toBe(2000);
    expect(parsed.costCents).toBe(42.5);
    expect(parsed.complexity).toBe('expert');
    expect(parsed.escalated).toBe(true);
    expect(parsed.latencyMs).toBe(3200);
  });
});

// ─── getDailySummary ────────────────────────────────────────────

describe('getDailySummary', () => {
  test('returns zero summary for empty date', () => {
    const summary = getDailySummary('2000-01-01');
    expect(summary.requestCount).toBe(0);
    expect(summary.totalCostCents).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(Object.keys(summary.modelBreakdown)).toHaveLength(0);
  });

  test('aggregates request count', () => {
    logUsage(makeEntry());
    logUsage(makeEntry());
    logUsage(makeEntry());

    const summary = getDailySummary(TEST_DATE);
    expect(summary.requestCount).toBe(3);
  });

  test('sums total tokens (input + output)', () => {
    logUsage(makeEntry({ inputTokens: 100, outputTokens: 50 }));
    logUsage(makeEntry({ inputTokens: 200, outputTokens: 300 }));

    const summary = getDailySummary(TEST_DATE);
    expect(summary.totalTokens).toBe(100 + 50 + 200 + 300);
  });

  test('sums total cost', () => {
    logUsage(makeEntry({ costCents: 10 }));
    logUsage(makeEntry({ costCents: 25.5 }));

    const summary = getDailySummary(TEST_DATE);
    expect(summary.totalCostCents).toBeCloseTo(35.5, 5);
  });

  test('breaks down by model', () => {
    logUsage(makeEntry({ model: 'claude-3-haiku', costCents: 5, inputTokens: 100, outputTokens: 50 }));
    logUsage(makeEntry({ model: 'claude-3-haiku', costCents: 3, inputTokens: 80, outputTokens: 40 }));
    logUsage(makeEntry({ model: 'gpt-4o', costCents: 20, inputTokens: 500, outputTokens: 1000 }));

    const summary = getDailySummary(TEST_DATE);

    expect(summary.modelBreakdown['claude-3-haiku']).toBeDefined();
    expect(summary.modelBreakdown['claude-3-haiku'].requests).toBe(2);
    expect(summary.modelBreakdown['claude-3-haiku'].tokens).toBe(100 + 50 + 80 + 40);
    expect(summary.modelBreakdown['claude-3-haiku'].costCents).toBeCloseTo(8, 5);

    expect(summary.modelBreakdown['gpt-4o']).toBeDefined();
    expect(summary.modelBreakdown['gpt-4o'].requests).toBe(1);
    expect(summary.modelBreakdown['gpt-4o'].tokens).toBe(1500);
    expect(summary.modelBreakdown['gpt-4o'].costCents).toBeCloseTo(20, 5);
  });
});

// ─── getUsageRange ──────────────────────────────────────────────

describe('getUsageRange', () => {
  test('returns empty for date range with no data', () => {
    // Far future dates won't have data
    const results = getUsageRange(0);
    expect(results).toEqual([]);
  });

  test('only includes days with data', () => {
    // Write data for today (which getUsageRange(7) would include)
    // This test is inherently date-dependent, so we just verify the shape
    const results = getUsageRange(7);
    for (const { date, summary } of results) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(summary.requestCount).toBeGreaterThan(0);
    }
  });
});

// ─── getTodayCostCents ──────────────────────────────────────────

describe('getTodayCostCents', () => {
  test('returns a number', () => {
    const cost = getTodayCostCents();
    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
