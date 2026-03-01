// ── Credit Management ────────────────────────────────────────────
// Client-side credit balance, spend limits, and mode management.
// Talks to the Vouch API for balance/limits, caches locally.

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { getEngramHome } from '../config';
import { loadPrivateKey, getPublicKeyHex } from '../privacy/identity';

// ── Types ────────────────────────────────────────────────────────

export interface CreditBalance {
  balanceSats: number;
  lifetimeDepositedSats: number;
  lifetimeSpentSats: number;
  dailyLimitSats: number | null;
  weeklyLimitSats: number | null;
  monthlyLimitSats: number | null;
  periodSpend: {
    dailySats: number;
    weeklySats: number;
    monthlySats: number;
  };
  cachedAt: number;
}

export interface CreditConfig {
  /** Auth mode: transparent (NIP-98) or private (blind tokens) */
  mode: 'transparent' | 'private';
  /** Gateway URL */
  gatewayUrl: string;
  /** Vouch API URL */
  vouchApiUrl: string;
  /** Spend limits */
  dailyLimitSats: number | null;
  weeklyLimitSats: number | null;
  monthlyLimitSats: number | null;
  /** Warning at this fraction of limit (0-1) */
  warningThreshold: number;
}

// ── Constants ────────────────────────────────────────────────────

const DEFAULT_GATEWAY_URL = 'https://gateway.percival-labs.ai';
const DEFAULT_VOUCH_API_URL = 'https://percivalvouch-api-production.up.railway.app';
const BALANCE_CACHE_TTL_MS = 60_000; // 1 minute

// ── NIP-98 Signing ───────────────────────────────────────────────

/**
 * Create a NIP-98 auth event for transparent mode.
 * Signs with the user's Nostr private key.
 */
export async function createNip98Auth(
  method: string,
  url: string,
): Promise<string | null> {
  const pubkey = getPublicKeyHex();
  const privkey = loadPrivateKey();
  if (!pubkey || !privkey) return null;

  const createdAt = Math.floor(Date.now() / 1000);

  const event = {
    pubkey,
    created_at: createdAt,
    kind: 27235,
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: '',
    id: '',
    sig: '',
  };

  // Compute event ID
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);

  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(serialized).digest('hex');
  event.id = hash;

  // Sign with Schnorr (using @noble/secp256k1 v1.x)
  const secp = await import('@noble/secp256k1');
  const sigBytes = await secp.schnorr.sign(
    event.id,
    privkey,
  );
  event.sig = bytesToHex(new Uint8Array(sigBytes));

  // Base64 encode
  const json = JSON.stringify(event);
  return `Nostr ${Buffer.from(json).toString('base64')}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Config ───────────────────────────────────────────────────────

function getCreditsConfigPath(): string {
  return join(getEngramHome(), 'credits.json');
}

export function loadCreditConfig(): CreditConfig {
  const path = getCreditsConfigPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      // Fall through to defaults
    }
  }
  return {
    mode: 'transparent',
    gatewayUrl: DEFAULT_GATEWAY_URL,
    vouchApiUrl: DEFAULT_VOUCH_API_URL,
    dailyLimitSats: null,
    weeklyLimitSats: null,
    monthlyLimitSats: null,
    warningThreshold: 0.8,
  };
}

export function saveCreditConfig(config: CreditConfig): void {
  const dir = getEngramHome();
  mkdirSync(dir, { recursive: true });
  const configPath = getCreditsConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  // Ensure permissions on existing file
  try { chmodSync(configPath, 0o600); } catch { /* best effort */ }
}

// ── Balance Cache ────────────────────────────────────────────────

function getBalanceCachePath(): string {
  return join(getEngramHome(), 'credits-cache.json');
}

function getCachedBalance(): CreditBalance | null {
  const path = getBalanceCachePath();
  if (!existsSync(path)) return null;
  try {
    const cached: CreditBalance = JSON.parse(readFileSync(path, 'utf-8'));
    if (Date.now() - cached.cachedAt < BALANCE_CACHE_TTL_MS) {
      return cached;
    }
  } catch {
    // Stale or corrupt
  }
  return null;
}

function cacheBalance(balance: CreditBalance): void {
  const cachePath = getBalanceCachePath();
  writeFileSync(cachePath, JSON.stringify(balance), { mode: 0o600 });
  try { chmodSync(cachePath, 0o600); } catch { /* best effort */ }
}

// ── API Calls ────────────────────────────────────────────────────

/**
 * Fetch current credit balance from Vouch API.
 * Uses NIP-98 auth. Caches result for 1 minute.
 */
export async function getBalance(forceRefresh = false): Promise<CreditBalance | null> {
  if (!forceRefresh) {
    const cached = getCachedBalance();
    if (cached) return cached;
  }

  const config = loadCreditConfig();
  const url = `${config.vouchApiUrl}/v1/credits/balance`;
  const auth = await createNip98Auth('GET', url);
  if (!auth) return null;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Vouch-Auth': auth,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      if (res.status === 404) {
        // No credit account yet
        return {
          balanceSats: 0,
          lifetimeDepositedSats: 0,
          lifetimeSpentSats: 0,
          dailyLimitSats: null,
          weeklyLimitSats: null,
          monthlyLimitSats: null,
          periodSpend: { dailySats: 0, weeklySats: 0, monthlySats: 0 },
          cachedAt: Date.now(),
        };
      }
      return null;
    }

    const data = await res.json() as {
      data: {
        balance_sats: number;
        lifetime_deposited_sats: number;
        lifetime_spent_sats: number;
        daily_limit_sats: number | null;
        weekly_limit_sats: number | null;
        monthly_limit_sats: number | null;
        period_spend: { daily_sats: number; weekly_sats: number; monthly_sats: number };
      };
    };

    const balance: CreditBalance = {
      balanceSats: data.data.balance_sats,
      lifetimeDepositedSats: data.data.lifetime_deposited_sats,
      lifetimeSpentSats: data.data.lifetime_spent_sats,
      dailyLimitSats: data.data.daily_limit_sats,
      weeklyLimitSats: data.data.weekly_limit_sats,
      monthlyLimitSats: data.data.monthly_limit_sats,
      periodSpend: {
        dailySats: data.data.period_spend?.daily_sats ?? 0,
        weeklySats: data.data.period_spend?.weekly_sats ?? 0,
        monthlySats: data.data.period_spend?.monthly_sats ?? 0,
      },
      cachedAt: Date.now(),
    };

    cacheBalance(balance);
    return balance;
  } catch (err) {
    console.error('[credits] Failed to fetch balance:', err);
    // Return stale cache if available
    return getCachedBalance();
  }
}

/**
 * Set spend limits on the Vouch API.
 */
export async function setLimits(limits: {
  dailySats?: number | null;
  weeklySats?: number | null;
  monthlySats?: number | null;
}): Promise<boolean> {
  const config = loadCreditConfig();
  const url = `${config.vouchApiUrl}/v1/credits/limits`;
  const auth = await createNip98Auth('POST', url);
  if (!auth) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vouch-Auth': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        daily_limit_sats: limits.dailySats,
        weekly_limit_sats: limits.weeklySats,
        monthly_limit_sats: limits.monthlySats,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      // Update local config too
      if (limits.dailySats !== undefined) config.dailyLimitSats = limits.dailySats;
      if (limits.weeklySats !== undefined) config.weeklyLimitSats = limits.weeklySats;
      if (limits.monthlySats !== undefined) config.monthlyLimitSats = limits.monthlySats;
      saveCreditConfig(config);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a proposed spend would exceed limits.
 * Client-side enforcement (instant feedback).
 */
export function checkSpendLimit(proposedSats: number): {
  allowed: boolean;
  reason?: string;
  remaining?: number;
} {
  const config = loadCreditConfig();
  const cached = getCachedBalance();
  if (!cached) {
    // No cached balance data — deny by default. Server will also enforce,
    // but client-side should fail-closed to prevent unmetered requests.
    return { allowed: false, reason: 'No cached balance data. Run `engram credits` to refresh.' };
  }

  // Check balance
  if (cached.balanceSats < proposedSats) {
    return {
      allowed: false,
      reason: `Insufficient balance: ${cached.balanceSats} sats (need ${proposedSats})`,
      remaining: cached.balanceSats,
    };
  }

  // Check daily limit
  if (config.dailyLimitSats !== null) {
    const dailyRemaining = config.dailyLimitSats - cached.periodSpend.dailySats;
    if (proposedSats > dailyRemaining) {
      return {
        allowed: false,
        reason: `Daily limit reached: ${cached.periodSpend.dailySats}/${config.dailyLimitSats} sats`,
        remaining: Math.max(0, dailyRemaining),
      };
    }
  }

  // Check weekly limit
  if (config.weeklyLimitSats !== null) {
    const weeklyRemaining = config.weeklyLimitSats - cached.periodSpend.weeklySats;
    if (proposedSats > weeklyRemaining) {
      return {
        allowed: false,
        reason: `Weekly limit reached: ${cached.periodSpend.weeklySats}/${config.weeklyLimitSats} sats`,
        remaining: Math.max(0, weeklyRemaining),
      };
    }
  }

  // Check monthly limit
  if (config.monthlyLimitSats !== null) {
    const monthlyRemaining = config.monthlyLimitSats - cached.periodSpend.monthlySats;
    if (proposedSats > monthlyRemaining) {
      return {
        allowed: false,
        reason: `Monthly limit reached: ${cached.periodSpend.monthlySats}/${config.monthlyLimitSats} sats`,
        remaining: Math.max(0, monthlyRemaining),
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if we're approaching a spend limit (for warnings).
 */
export function getSpendWarnings(): string[] {
  const config = loadCreditConfig();
  const cached = getCachedBalance();
  if (!cached) return [];

  const warnings: string[] = [];
  const threshold = config.warningThreshold;

  if (config.dailyLimitSats !== null) {
    const ratio = cached.periodSpend.dailySats / config.dailyLimitSats;
    if (ratio >= threshold) {
      warnings.push(`Daily spend at ${(ratio * 100).toFixed(0)}% (${cached.periodSpend.dailySats}/${config.dailyLimitSats} sats)`);
    }
  }

  if (config.weeklyLimitSats !== null) {
    const ratio = cached.periodSpend.weeklySats / config.weeklyLimitSats;
    if (ratio >= threshold) {
      warnings.push(`Weekly spend at ${(ratio * 100).toFixed(0)}% (${cached.periodSpend.weeklySats}/${config.weeklyLimitSats} sats)`);
    }
  }

  if (config.monthlyLimitSats !== null) {
    const ratio = cached.periodSpend.monthlySats / config.monthlyLimitSats;
    if (ratio >= threshold) {
      warnings.push(`Monthly spend at ${(ratio * 100).toFixed(0)}% (${cached.periodSpend.monthlySats}/${config.monthlyLimitSats} sats)`);
    }
  }

  return warnings;
}

/**
 * Create a Lightning deposit invoice via Vouch API.
 */
export async function createDeposit(amountSats: number): Promise<{
  invoiceId: string;
  bolt11: string;
  amountSats: number;
} | null> {
  const config = loadCreditConfig();
  const url = `${config.vouchApiUrl}/v1/credits/deposit`;
  const auth = await createNip98Auth('POST', url);
  if (!auth) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vouch-Auth': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount_sats: amountSats }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      data: { deposit_id: string; bolt11: string; amount_sats: number };
    };

    return {
      invoiceId: data.data.deposit_id,
      bolt11: data.data.bolt11,
      amountSats: data.data.amount_sats,
    };
  } catch {
    return null;
  }
}

/**
 * Check deposit confirmation status.
 */
export async function checkDeposit(depositId: string): Promise<'pending' | 'confirmed' | 'failed'> {
  const config = loadCreditConfig();
  const url = `${config.vouchApiUrl}/v1/credits/deposit/confirm`;
  const auth = await createNip98Auth('POST', url);
  if (!auth) return 'failed';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vouch-Auth': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deposit_id: depositId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return 'failed';

    const data = await res.json() as { data: { status: string } };
    return data.data.status as 'pending' | 'confirmed' | 'failed';
  } catch {
    return 'failed';
  }
}
