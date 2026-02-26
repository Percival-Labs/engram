// ── Usage Command ────────────────────────────────────────────────
// engram usage [--week] [--month]
// Also available as /usage in chat.

import { getDailySummary, getUsageRange } from '../lib/router/index';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';

interface UsageOptions {
  week?: boolean;
  month?: boolean;
}

function formatCost(cents: number): string {
  if (cents === 0) return `${GREEN}free${RESET}`;
  return `$${(cents / 100).toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/**
 * Print usage summary (used by both CLI command and /usage slash command).
 */
export function printUsageSummary(options: UsageOptions = {}): void {
  console.log('');
  console.log(`  ${BOLD}Usage${RESET}`);
  console.log(`  ${DIM}────────────────────────────────────────────────────${RESET}`);

  if (options.week || options.month) {
    const days = options.month ? 30 : 7;
    const label = options.month ? 'Last 30 days' : 'Last 7 days';
    const range = getUsageRange(days);

    if (range.length === 0) {
      console.log(`  ${GRAY}No usage data for ${label.toLowerCase()}.${RESET}`);
      console.log(`  ${GRAY}Enable routing to start tracking: set routing.enabled = true in config.json${RESET}`);
      console.log('');
      return;
    }

    // Header
    console.log(`  ${DIM}${'Date'.padEnd(12)} ${'Requests'.padEnd(10)} ${'Tokens'.padEnd(10)} ${'Cost'.padEnd(10)}${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}${RESET}`);

    let totalCost = 0;
    let totalTokens = 0;
    let totalRequests = 0;

    for (const { date, summary } of range) {
      totalCost += summary.totalCostCents;
      totalTokens += summary.totalTokens;
      totalRequests += summary.requestCount;

      console.log(
        `  ${date.padEnd(12)} ` +
        `${String(summary.requestCount).padEnd(10)} ` +
        `${formatTokens(summary.totalTokens).padEnd(10)} ` +
        `${formatCost(summary.totalCostCents).padEnd(10)}`
      );
    }

    console.log(`  ${DIM}${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}${RESET}`);
    console.log(
      `  ${BOLD}${'Total'.padEnd(12)}${RESET} ` +
      `${BOLD}${String(totalRequests).padEnd(10)}${RESET} ` +
      `${BOLD}${formatTokens(totalTokens).padEnd(10)}${RESET} ` +
      `${BOLD}${formatCost(totalCost)}${RESET}`
    );
  } else {
    // Today's summary
    const summary = getDailySummary();

    if (summary.requestCount === 0) {
      console.log(`  ${GRAY}No usage data for today.${RESET}`);
      console.log(`  ${GRAY}Enable routing to start tracking: set routing.enabled = true in config.json${RESET}`);
      console.log('');
      return;
    }

    console.log(`  ${CYAN}Today${RESET}`);
    console.log(`  Requests:  ${BOLD}${summary.requestCount}${RESET}`);
    console.log(`  Tokens:    ${BOLD}${formatTokens(summary.totalTokens)}${RESET}`);
    console.log(`  Cost:      ${BOLD}${formatCost(summary.totalCostCents)}${RESET}`);

    // Model breakdown
    const models = Object.entries(summary.modelBreakdown);
    if (models.length > 0) {
      console.log('');
      console.log(`  ${DIM}Model breakdown:${RESET}`);
      for (const [model, data] of models.sort((a, b) => b[1].costCents - a[1].costCents)) {
        console.log(
          `  ${GRAY}  ${model.padEnd(24)}${RESET} ` +
          `${String(data.requests).padEnd(6)} reqs  ` +
          `${formatTokens(data.tokens).padEnd(8)} tok  ` +
          `${formatCost(data.costCents)}`
        );
      }
    }
  }

  console.log('');
}

/**
 * CLI command handler.
 */
export async function usage(options: UsageOptions = {}): Promise<void> {
  printUsageSummary(options);
}
