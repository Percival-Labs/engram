// ── Credits Command ──────────────────────────────────────────────
// engram credits                  — show balance and limits
// engram credits deposit <sats>   — create Lightning deposit
// engram credits limit            — set spend limits
// engram credits mode             — switch auth mode
// engram credits usage            — usage history

import {
  getBalance,
  loadCreditConfig,
  saveCreditConfig,
  setLimits,
  createDeposit,
  checkDeposit,
} from '../lib/credits/index';
import { getPublicKeyHex } from '../lib/privacy/identity';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M sats`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K sats`;
  return `${sats} sats`;
}

// ── Balance ─────────────────────────────────────────────────────

export async function creditsBalance(): Promise<void> {
  const pubkey = getPublicKeyHex();
  if (!pubkey) {
    console.log(`\n  ${RED}No identity found.${RESET} Run ${BOLD}engram init${RESET} first.\n`);
    return;
  }

  const config = loadCreditConfig();
  console.log('');
  console.log(`  ${BOLD}Credits${RESET}`);
  console.log(`  ${DIM}────────────────────────────────────────────${RESET}`);
  console.log(`  Mode:      ${BOLD}${config.mode}${RESET}`);
  console.log(`  Gateway:   ${DIM}${config.gatewayUrl}${RESET}`);
  console.log(`  Identity:  ${DIM}${pubkey.slice(0, 16)}...${RESET}`);

  const balance = await getBalance(true);
  if (!balance) {
    console.log(`\n  ${YELLOW}Could not reach Vouch API.${RESET}`);
    console.log(`  ${GRAY}Check network connection or API status.${RESET}\n`);
    return;
  }

  console.log('');
  console.log(`  ${CYAN}Balance${RESET}`);
  console.log(`  Available:    ${BOLD}${GREEN}${formatSats(balance.balanceSats)}${RESET}`);
  console.log(`  Deposited:    ${formatSats(balance.lifetimeDepositedSats)}`);
  console.log(`  Spent:        ${formatSats(balance.lifetimeSpentSats)}`);

  // Spend limits
  const hasLimits = balance.dailyLimitSats !== null ||
    balance.weeklyLimitSats !== null ||
    balance.monthlyLimitSats !== null;

  if (hasLimits) {
    console.log('');
    console.log(`  ${CYAN}Spend Limits${RESET}`);
    if (balance.dailyLimitSats !== null) {
      const pct = balance.periodSpend.dailySats / balance.dailyLimitSats;
      const color = pct > 0.8 ? RED : pct > 0.5 ? YELLOW : GREEN;
      console.log(`  Daily:    ${color}${formatSats(balance.periodSpend.dailySats)}${RESET} / ${formatSats(balance.dailyLimitSats)}`);
    }
    if (balance.weeklyLimitSats !== null) {
      const pct = balance.periodSpend.weeklySats / balance.weeklyLimitSats;
      const color = pct > 0.8 ? RED : pct > 0.5 ? YELLOW : GREEN;
      console.log(`  Weekly:   ${color}${formatSats(balance.periodSpend.weeklySats)}${RESET} / ${formatSats(balance.weeklyLimitSats)}`);
    }
    if (balance.monthlyLimitSats !== null) {
      const pct = balance.periodSpend.monthlySats / balance.monthlyLimitSats;
      const color = pct > 0.8 ? RED : pct > 0.5 ? YELLOW : GREEN;
      console.log(`  Monthly:  ${color}${formatSats(balance.periodSpend.monthlySats)}${RESET} / ${formatSats(balance.monthlyLimitSats)}`);
    }
  }

  console.log('');
}

// ── Deposit ─────────────────────────────────────────────────────

export async function creditsDeposit(amountStr: string): Promise<void> {
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    console.log(`\n  ${RED}Invalid amount.${RESET} Usage: ${BOLD}engram credits deposit <sats>${RESET}\n`);
    return;
  }

  console.log(`\n  Creating Lightning invoice for ${BOLD}${formatSats(amount)}${RESET}...`);

  const result = await createDeposit(amount);
  if (!result) {
    console.log(`  ${RED}Failed to create deposit.${RESET} Check identity and network.\n`);
    return;
  }

  console.log('');
  console.log(`  ${GREEN}Invoice created!${RESET}`);
  console.log(`  ${DIM}────────────────────────────────────────────${RESET}`);
  console.log(`  Amount:  ${BOLD}${formatSats(result.amountSats)}${RESET}`);
  console.log(`  ID:      ${DIM}${result.invoiceId}${RESET}`);
  console.log('');
  console.log(`  ${BOLD}Lightning Invoice:${RESET}`);
  console.log(`  ${result.bolt11}`);
  console.log('');
  console.log(`  ${GRAY}Pay this invoice with any Lightning wallet.${RESET}`);
  console.log(`  ${GRAY}Checking for payment...${RESET}`);

  // Poll for confirmation (max 5 minutes)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 10_000));
    const status = await checkDeposit(result.invoiceId);

    if (status === 'confirmed') {
      console.log(`\n  ${GREEN}${BOLD}Payment confirmed!${RESET} ${formatSats(amount)} added to your balance.\n`);
      return;
    }

    if (status === 'failed') {
      console.log(`\n  ${RED}Payment failed.${RESET}\n`);
      return;
    }

    process.stdout.write('.');
  }

  console.log(`\n  ${YELLOW}Still waiting for payment.${RESET} Run ${BOLD}engram credits${RESET} to check balance.\n`);
}

// ── Limits ──────────────────────────────────────────────────────

export async function creditsLimit(options: {
  daily?: string;
  weekly?: string;
  monthly?: string;
}): Promise<void> {
  const limits: {
    dailySats?: number | null;
    weeklySats?: number | null;
    monthlySats?: number | null;
  } = {};

  if (options.daily !== undefined) {
    limits.dailySats = options.daily === 'none' ? null : parseInt(options.daily, 10);
  }
  if (options.weekly !== undefined) {
    limits.weeklySats = options.weekly === 'none' ? null : parseInt(options.weekly, 10);
  }
  if (options.monthly !== undefined) {
    limits.monthlySats = options.monthly === 'none' ? null : parseInt(options.monthly, 10);
  }

  if (Object.keys(limits).length === 0) {
    console.log(`\n  ${YELLOW}No limits specified.${RESET}`);
    console.log(`  Usage: ${BOLD}engram credits limit --daily <sats> --weekly <sats> --monthly <sats>${RESET}`);
    console.log(`  Use "none" to remove a limit: ${BOLD}engram credits limit --daily none${RESET}\n`);
    return;
  }

  console.log(`  Setting spend limits...`);
  const success = await setLimits(limits);

  if (success) {
    console.log(`\n  ${GREEN}Limits updated.${RESET}`);
    if (limits.dailySats !== undefined) {
      console.log(`  Daily:    ${limits.dailySats === null ? 'none' : formatSats(limits.dailySats)}`);
    }
    if (limits.weeklySats !== undefined) {
      console.log(`  Weekly:   ${limits.weeklySats === null ? 'none' : formatSats(limits.weeklySats)}`);
    }
    if (limits.monthlySats !== undefined) {
      console.log(`  Monthly:  ${limits.monthlySats === null ? 'none' : formatSats(limits.monthlySats)}`);
    }
  } else {
    console.log(`  ${RED}Failed to update limits.${RESET}`);
  }
  console.log('');
}

// ── Mode ────────────────────────────────────────────────────────

export async function creditsMode(mode?: string): Promise<void> {
  const config = loadCreditConfig();

  if (!mode) {
    console.log(`\n  Current mode: ${BOLD}${config.mode}${RESET}`);
    console.log(`  ${DIM}Usage: engram credits mode [transparent|private]${RESET}\n`);
    return;
  }

  if (mode !== 'transparent' && mode !== 'private') {
    console.log(`\n  ${RED}Invalid mode.${RESET} Use "transparent" or "private".\n`);
    return;
  }

  config.mode = mode;
  saveCreditConfig(config);

  console.log(`\n  ${GREEN}Mode set to:${RESET} ${BOLD}${mode}${RESET}`);

  if (mode === 'transparent') {
    console.log(`  ${GRAY}NIP-98 auth, per-request billing, full cost visibility.${RESET}`);
  } else {
    console.log(`  ${GRAY}Blind token auth, prepaid batch billing, full anonymity.${RESET}`);
  }
  console.log('');
}
