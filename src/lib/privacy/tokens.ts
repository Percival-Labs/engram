// ── Token Manager ────────────────────────────────────────────────
// Client-side blind signature token lifecycle.
//
// 1. Request tokens from issuer (blind the request locally)
// 2. Receive blind signatures, finalize locally (unblind)
// 3. Cache finalized tokens encrypted on disk
// 4. Pop one token per external API call
// 5. Background refresh when cache runs low
//
// The issuer never sees the finalized tokens.
// The proxy never sees which tokens came from which issuance.

import { publicVerif } from '@cloudflare/privacypass-ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getEngramHome } from '../config';
import type { TokenConfig } from './types';

const { Client, BlindRSAMode } = publicVerif;

// ── Types ────────────────────────────────────────────────────────

interface StoredToken {
  /** Serialized finalized token (base64) */
  token: string;
  /** When this token was issued */
  issuedAt: string;
}

interface TokenStore {
  tokens: StoredToken[];
  issuerPublicKey: string;  // base64-encoded public key bytes
  updatedAt: string;
}

interface PendingRequest {
  tokenRequest: Uint8Array;
  finalizationData: Awaited<ReturnType<InstanceType<typeof Client>['createTokenRequest']>>;
}

// ── Token Cache ──────────────────────────────────────────────────

let tokenCache: StoredToken[] = [];
let issuerPublicKeyBytes: Uint8Array | null = null;
let encryptionKey: Buffer | null = null;
let isRefreshing = false;

function getTokenStorePath(): string {
  return join(getEngramHome(), 'privacy', 'tokens.enc');
}

function getKeyPath(): string {
  return join(getEngramHome(), 'privacy', 'token.key');
}

/**
 * Initialize or load the encryption key for token storage.
 */
function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;

  const keyPath = getKeyPath();
  if (existsSync(keyPath)) {
    encryptionKey = Buffer.from(readFileSync(keyPath, 'utf-8'), 'hex');
    return encryptionKey;
  }

  // Generate new key
  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  encryptionKey = randomBytes(32);
  writeFileSync(keyPath, encryptionKey.toString('hex'), { mode: 0o600 });
  return encryptionKey;
}

function encrypt(data: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(data: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

// ── Persistence ──────────────────────────────────────────────────

function saveTokenStore(): void {
  if (tokenCache.length === 0) return;

  const store: TokenStore = {
    tokens: tokenCache,
    issuerPublicKey: issuerPublicKeyBytes
      ? Buffer.from(issuerPublicKeyBytes).toString('base64')
      : '',
    updatedAt: new Date().toISOString(),
  };

  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const encrypted = encrypt(JSON.stringify(store));
  writeFileSync(getTokenStorePath(), encrypted, { mode: 0o600 });
}

function loadTokenStore(): void {
  const path = getTokenStorePath();
  if (!existsSync(path)) return;

  try {
    const raw = readFileSync(path, 'utf-8');
    const json = decrypt(raw);
    const store: TokenStore = JSON.parse(json);
    tokenCache = store.tokens;
    if (store.issuerPublicKey) {
      issuerPublicKeyBytes = new Uint8Array(
        Buffer.from(store.issuerPublicKey, 'base64'),
      );
    }
  } catch {
    // Corrupted store — start fresh
    tokenCache = [];
  }
}

// ── Token Issuance (Client Side) ─────────────────────────────────

/**
 * Request a batch of blind-signed tokens from an issuer.
 *
 * @param issuerUrl - URL of the token issuer service
 * @param count - Number of tokens to request
 * @param authHeader - Authorization header (Vouch NIP-98 or API key)
 */
export async function requestTokenBatch(
  issuerUrl: string,
  count: number,
  authHeader?: string,
): Promise<number> {
  const client = new Client(BlindRSAMode.PSS);

  // First, get the issuer's public key
  const pkRes = await fetch(`${issuerUrl}/public-key`);
  if (!pkRes.ok) throw new Error(`Issuer public key fetch failed: ${pkRes.status}`);
  const pkData = await pkRes.json() as { publicKey: string; issuerName: string };
  issuerPublicKeyBytes = new Uint8Array(Buffer.from(pkData.publicKey, 'base64'));

  // Import the public key for Privacy Pass operations
  const publicKey = await crypto.subtle.importKey(
    'spki',
    issuerPublicKeyBytes,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
  const pkBytes = await publicVerif.getPublicKeyBytes(publicKey);

  // Create an origin for challenge generation
  const origin = new publicVerif.Origin(BlindRSAMode.PSS, ['inference.local']);

  let issued = 0;

  // Issue tokens one at a time (batched issuance is a future optimization)
  for (let i = 0; i < count; i++) {
    const ctx = crypto.getRandomValues(new Uint8Array(32));
    const challenge = origin.createTokenChallenge(pkData.issuerName, ctx);
    const tokenRequest = await client.createTokenRequest(challenge, pkBytes);

    // Send blinded request to issuer
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    if (authHeader) headers['Authorization'] = authHeader;

    const issueRes = await fetch(`${issuerUrl}/issue`, {
      method: 'POST',
      headers,
      body: tokenRequest.serialize(),
    });

    if (!issueRes.ok) {
      console.error(`[Privacy] Token issuance failed: ${issueRes.status}`);
      break;
    }

    // Finalize (unblind) locally
    const blindSig = new Uint8Array(await issueRes.arrayBuffer());
    const tokenResponse = publicVerif.TokenResponse.deserialize(blindSig);
    const token = await client.finalize(tokenResponse);

    tokenCache.push({
      token: Buffer.from(token.serialize()).toString('base64'),
      issuedAt: new Date().toISOString(),
    });
    issued++;
  }

  if (issued > 0) saveTokenStore();
  return issued;
}

// ── Token Consumption ────────────────────────────────────────────

/**
 * Pop a token from the cache for use in an API call.
 * Returns null if no tokens available.
 */
export function popToken(): Uint8Array | null {
  if (tokenCache.length === 0) {
    loadTokenStore();
  }

  const stored = tokenCache.shift();
  if (!stored) return null;

  saveTokenStore();
  return new Uint8Array(Buffer.from(stored.token, 'base64'));
}

/**
 * Get current token count without consuming any.
 */
export function getTokenCount(): number {
  if (tokenCache.length === 0) loadTokenStore();
  return tokenCache.length;
}

/**
 * Check if tokens need refreshing based on config threshold.
 */
export function needsRefresh(config: TokenConfig): boolean {
  return getTokenCount() < config.refreshThreshold;
}

/**
 * Background refresh — request more tokens if cache is low.
 * Non-blocking, won't throw.
 */
export async function maybeRefresh(config: TokenConfig, authHeader?: string): Promise<void> {
  if (isRefreshing) return;
  if (!needsRefresh(config)) return;
  if (!config.enabled) return;

  const issuerUrl = resolveIssuerUrl(config);
  if (!issuerUrl) return;

  isRefreshing = true;
  try {
    await requestTokenBatch(issuerUrl, config.batchSize, authHeader);
  } catch (err) {
    console.error(`[Privacy] Token refresh failed: ${err}`);
  } finally {
    isRefreshing = false;
  }
}

function resolveIssuerUrl(config: TokenConfig): string | null {
  switch (config.issuer) {
    case 'self-hosted':
      return config.issuerUrl ?? null;
    case 'vouch':
      return 'https://percivalvouch-api-production.up.railway.app/v1/proxy';
    case 'openrouter':
      return null; // Not yet implemented
    default:
      return null;
  }
}

// ── Initialization ───────────────────────────────────────────────

/**
 * Initialize the token manager — loads cached tokens from disk.
 */
export function initTokenManager(): void {
  loadTokenStore();
}

/**
 * Reset all state (for testing).
 */
export function _resetTokenManager(): void {
  tokenCache = [];
  issuerPublicKeyBytes = null;
  encryptionKey = null;
  isRefreshing = false;
}
