// ── Usage Tracker ────────────────────────────────────────────────
// JSONL append-only usage logging. One file per day.

import { existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { getEngramHome } from '../config';
import type { UsageEntry, UsageSummary } from './types';

// ── Paths ────────────────────────────────────────────────────────

function getUsageDir(): string {
  return join(getEngramHome(), 'usage');
}

function getDateKey(date?: string): string {
  if (date) return date;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getUsagePath(dateKey: string): string {
  return join(getUsageDir(), `${dateKey}.jsonl`);
}

// ── Write ────────────────────────────────────────────────────────

export function logUsage(entry: UsageEntry): void {
  const dir = getUsageDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const dateKey = entry.timestamp.slice(0, 10); // YYYY-MM-DD
  const path = getUsagePath(dateKey);
  const line = JSON.stringify(entry) + '\n';

  try {
    appendFileSync(path, line, 'utf-8');
  } catch (err) {
    console.error(`[Router] Failed to log usage: ${err}`);
  }
}

// ── Read ─────────────────────────────────────────────────────────

export function getDailyUsage(date?: string): UsageEntry[] {
  const dateKey = getDateKey(date);
  const path = getUsagePath(dateKey);

  if (!existsSync(path)) return [];

  const lines = readFileSync(path, 'utf-8').trim().split('\n');
  const entries: UsageEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

export function getDailySummary(date?: string): UsageSummary {
  const entries = getDailyUsage(date);

  const summary: UsageSummary = {
    totalCostCents: 0,
    totalTokens: 0,
    requestCount: entries.length,
    modelBreakdown: {},
  };

  for (const entry of entries) {
    const tokens = entry.inputTokens + entry.outputTokens;
    summary.totalCostCents += entry.costCents;
    summary.totalTokens += tokens;

    if (!summary.modelBreakdown[entry.model]) {
      summary.modelBreakdown[entry.model] = { requests: 0, tokens: 0, costCents: 0 };
    }
    summary.modelBreakdown[entry.model].requests++;
    summary.modelBreakdown[entry.model].tokens += tokens;
    summary.modelBreakdown[entry.model].costCents += entry.costCents;
  }

  return summary;
}

/**
 * Get usage entries for a date range (for --week / --month flags).
 */
export function getUsageRange(days: number): { date: string; summary: UsageSummary }[] {
  const results: { date: string; summary: UsageSummary }[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const summary = getDailySummary(dateKey);
    if (summary.requestCount > 0) {
      results.push({ date: dateKey, summary });
    }
  }

  return results;
}

/**
 * Get today's total cost in cents (for budget checking).
 */
export function getTodayCostCents(): number {
  return getDailySummary().totalCostCents;
}
