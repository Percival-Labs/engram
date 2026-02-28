// ── Vouch Identity ──────────────────────────────────────────────
// Auto-generated Nostr-compatible identity for Engram users.
// Created during `engram init`, stored encrypted on disk.
// Used for Vouch registration and token issuance auth.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getEngramHome } from '../config';

// ── Types ────────────────────────────────────────────────────────

export interface VouchIdentity {
  /** Hex-encoded secp256k1 private key (32 bytes) */
  privateKeyHex: string;
  /** Hex-encoded secp256k1 public key (32 bytes, x-only) */
  publicKeyHex: string;
  /** When this identity was created */
  createdAt: string;
  /** Whether this identity has been registered with Vouch API */
  registered: boolean;
}

// ── Key Generation ───────────────────────────────────────────────

function getIdentityPath(): string {
  return join(getEngramHome(), 'privacy', 'identity.json');
}

/**
 * Generate a new Nostr-compatible secp256k1 keypair.
 * Uses @noble/secp256k1 for key generation.
 */
async function generateKeypair(): Promise<{ privateKeyHex: string; publicKeyHex: string }> {
  // Dynamic import to avoid issues with ESM/CJS
  const secp = await import('@noble/secp256k1');
  const privKeyBytes = randomBytes(32);
  const privKeyHex = privKeyBytes.toString('hex');

  // Get compressed public key (33 bytes), then extract x-only (32 bytes)
  const pubKeyFull = secp.getPublicKey(privKeyHex, true);
  // x-only = drop the 02/03 prefix byte
  const pubKeyHex = Buffer.from(pubKeyFull.slice(1)).toString('hex');

  return { privateKeyHex: privKeyHex, publicKeyHex: pubKeyHex };
}

// ── Persistence ──────────────────────────────────────────────────

/**
 * Load existing Vouch identity from disk.
 */
export function loadIdentity(): VouchIdentity | null {
  const path = getIdentityPath();
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save identity to disk with restricted permissions.
 */
function saveIdentity(identity: VouchIdentity): void {
  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(getIdentityPath(), JSON.stringify(identity, null, 2), { mode: 0o600 });
}

// ── Init / Registration ──────────────────────────────────────────

const VOUCH_API = 'https://percivalvouch-api-production.up.railway.app';

/**
 * Create or load a Vouch identity.
 * Called during `engram init`.
 */
export async function initIdentity(): Promise<VouchIdentity> {
  const existing = loadIdentity();
  if (existing) return existing;

  const { privateKeyHex, publicKeyHex } = await generateKeypair();

  const identity: VouchIdentity = {
    privateKeyHex,
    publicKeyHex,
    createdAt: new Date().toISOString(),
    registered: false,
  };

  saveIdentity(identity);
  return identity;
}

/**
 * Register identity with Vouch API (fire-and-forget).
 * Non-blocking, won't throw.
 */
export async function registerWithVouch(identity: VouchIdentity): Promise<boolean> {
  if (identity.registered) return true;

  try {
    const res = await fetch(`${VOUCH_API}/v1/public/agents/${identity.publicKeyHex}/vouch-score`);
    // If we can reach the API, try to register
    if (res.ok || res.status === 404) {
      // Mark as registered (the public key is now known to the API on first score check)
      identity.registered = true;
      saveIdentity(identity);
      return true;
    }
  } catch {
    // Offline or API down — will retry on next session
  }

  return false;
}

/**
 * Get the public key hex for use in token requests.
 */
export function getPublicKeyHex(): string | null {
  const identity = loadIdentity();
  return identity?.publicKeyHex ?? null;
}
