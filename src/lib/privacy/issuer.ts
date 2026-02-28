// ── Token Issuer ─────────────────────────────────────────────────
// Blind-signs Privacy Pass tokens for anonymous inference.
// Can run as a local issuer or be deployed as a service.
//
// Flow:
// 1. Client generates token + blinds it (client-side, in tokens.ts)
// 2. Client sends blinded token to issuer
// 3. Issuer signs without seeing the original token
// 4. Client unblinds to get a valid, unlinkable token
// 5. Client redeems token at proxy — issuer can't link issuance to redemption

import { publicVerif, Token } from '@cloudflare/privacypass-ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getEngramHome } from '../config';

const { Issuer, Origin, getPublicKeyBytes, BlindRSAMode, BLIND_RSA } = publicVerif;

export type { Token } from '@cloudflare/privacypass-ts';

// ── Types ────────────────────────────────────────────────────────

export interface IssuerKeyPair {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
  /** Key version for rotation support. Defaults to 1 for legacy keys. */
  version?: number;
  /** RSA modulus length used during generation */
  modulusLength?: number;
}

/** Key file format supporting rotation (current + previous key) */
interface IssuerKeyFile {
  current: IssuerKeyPair;
  /** Previous key accepted during rotation window */
  previous?: IssuerKeyPair;
}

export interface IssuerInstance {
  issuer: InstanceType<typeof Issuer>;
  origin: InstanceType<typeof Origin>;
  publicKeyBytes: Uint8Array;
}

// ── Key Management ───────────────────────────────────────────────

const ISSUER_NAME = 'engram-privacy.local';
const ORIGIN_NAME = 'inference.local';

function getKeysPath(): string {
  return join(getEngramHome(), 'privacy', 'issuer-keys.json');
}

async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['sign'],
  );
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
}

/**
 * Generate a new issuer keypair and persist to disk.
 * Uses RSA-4096 for blind signature security.
 */
export async function generateIssuerKeys(): Promise<IssuerKeyPair> {
  const keys = await Issuer.generateKey(BlindRSAMode.PSS, {
    modulusLength: 4096,
    publicExponent: Uint8Array.from([1, 0, 1]),
  });

  const keyPair: IssuerKeyPair = {
    privateKeyJwk: await exportKey(keys.privateKey),
    publicKeyJwk: await exportKey(keys.publicKey),
    createdAt: new Date().toISOString(),
    version: 1,
    modulusLength: 4096,
  };

  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const keyFile: IssuerKeyFile = { current: keyPair };
  writeFileSync(getKeysPath(), JSON.stringify(keyFile, null, 2), { mode: 0o600 });

  return keyPair;
}

/**
 * Load existing issuer keys or generate new ones.
 * Handles both legacy (flat) and new (IssuerKeyFile) formats.
 * Auto-regenerates RSA-2048 keys to RSA-4096.
 */
export async function loadOrCreateIssuerKeys(): Promise<IssuerKeyPair> {
  const path = getKeysPath();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));

    // New format with current/previous
    if (raw.current) {
      const keyFile = raw as IssuerKeyFile;
      // Check if existing key is weak (RSA-2048)
      if (keyFile.current.modulusLength && keyFile.current.modulusLength < 4096) {
        return rotateKeys(keyFile);
      }
      // Legacy keys without modulusLength field — check JWK modulus
      if (!keyFile.current.modulusLength) {
        const nLen = keyFile.current.publicKeyJwk.n?.length ?? 0;
        // Base64url-encoded 4096-bit modulus is ~683 chars; 2048-bit is ~342
        if (nLen < 600) {
          return rotateKeys(keyFile);
        }
      }
      return keyFile.current;
    }

    // Legacy flat format — migrate
    const legacy = raw as IssuerKeyPair;
    const nLen = legacy.publicKeyJwk.n?.length ?? 0;
    if (nLen < 600) {
      // Weak key — regenerate with old as previous
      const keyFile: IssuerKeyFile = { current: legacy, previous: undefined };
      return rotateKeys(keyFile);
    }

    // Strong legacy key — wrap in new format
    legacy.version = legacy.version ?? 1;
    const keyFile: IssuerKeyFile = { current: legacy };
    writeFileSync(path, JSON.stringify(keyFile, null, 2), { mode: 0o600 });
    return legacy;
  }
  return generateIssuerKeys();
}

/**
 * Rotate to a new RSA-4096 key, keeping the old key as `previous`
 * for verifying tokens issued under the prior key.
 */
async function rotateKeys(existing: IssuerKeyFile): Promise<IssuerKeyPair> {
  const newKeys = await Issuer.generateKey(BlindRSAMode.PSS, {
    modulusLength: 4096,
    publicExponent: Uint8Array.from([1, 0, 1]),
  });

  const version = (existing.current.version ?? 1) + 1;
  const newKeyPair: IssuerKeyPair = {
    privateKeyJwk: await exportKey(newKeys.privateKey),
    publicKeyJwk: await exportKey(newKeys.publicKey),
    createdAt: new Date().toISOString(),
    version,
    modulusLength: 4096,
  };

  const keyFile: IssuerKeyFile = {
    current: newKeyPair,
    previous: existing.current,
  };

  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(getKeysPath(), JSON.stringify(keyFile, null, 2), { mode: 0o600 });

  return newKeyPair;
}

/**
 * Create an issuer instance from stored keys.
 */
export async function createIssuer(keys?: IssuerKeyPair): Promise<IssuerInstance> {
  const keyPair = keys ?? await loadOrCreateIssuerKeys();

  const privateKey = await importPrivateKey(keyPair.privateKeyJwk);
  const publicKey = await importPublicKey(keyPair.publicKeyJwk);

  const issuer = new Issuer(BlindRSAMode.PSS, ISSUER_NAME, privateKey, publicKey);
  const origin = new Origin(BlindRSAMode.PSS, [ORIGIN_NAME]);
  const publicKeyBytes = await getPublicKeyBytes(publicKey);

  return { issuer, origin, publicKeyBytes };
}

// ── Token Issuance ───────────────────────────────────────────────

/**
 * Issue (blind-sign) a token request from a client.
 * The issuer sees the blinded token but cannot link it to the
 * finalized token the client will use for redemption.
 */
export async function issueToken(
  issuerInstance: IssuerInstance,
  tokenRequest: Uint8Array,
): Promise<Uint8Array> {
  // Deserialize the token request (BLIND_RSA token type for public verification)
  const tokReq = publicVerif.TokenRequest.deserialize(BLIND_RSA, tokenRequest);

  // Blind-sign it
  const tokRes = await issuerInstance.issuer.issue(tokReq);

  // Serialize for transport
  return tokRes.serialize();
}

/**
 * Verify a redeemed token.
 * Used by the proxy to check that a token is valid before
 * forwarding the inference request.
 */
export async function verifyToken(
  issuerInstance: IssuerInstance,
  tokenBytes: Uint8Array,
): Promise<boolean> {
  try {
    const token = Token.deserialize(BLIND_RSA, tokenBytes);
    return await issuerInstance.origin.verify(token, issuerInstance.issuer.publicKey);
  } catch {
    return false;
  }
}

// ── Double-Spend Tracking (Persistent) ───────────────────────────

interface SpentTokenEntry {
  /** When the token was redeemed (epoch ms) */
  redeemedAt: number;
}

/** In-memory cache backed by disk persistence */
let spentTokens = new Map<string, SpentTokenEntry>();
let spentTokensLoaded = false;

/** Token IDs older than this are pruned (7 days) */
const SPENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSpentTokensPath(): string {
  return join(getEngramHome(), 'privacy', 'spent-tokens.json');
}

function loadSpentTokens(): void {
  if (spentTokensLoaded) return;
  spentTokensLoaded = true;

  const path = getSpentTokensPath();
  if (!existsSync(path)) return;

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const now = Date.now();

    // Load and prune expired entries
    for (const [id, entry] of Object.entries(raw)) {
      const e = entry as SpentTokenEntry;
      if (now - e.redeemedAt < SPENT_TOKEN_TTL_MS) {
        spentTokens.set(id, e);
      }
    }
  } catch {
    // Corrupted file — start fresh
    spentTokens = new Map();
  }
}

function saveSpentTokens(): void {
  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const obj: Record<string, SpentTokenEntry> = {};
  for (const [id, entry] of spentTokens) {
    obj[id] = entry;
  }

  writeFileSync(getSpentTokensPath(), JSON.stringify(obj), { mode: 0o600 });
}

/**
 * Compute a SHA-256 hash of the full token bytes as a unique ID.
 * Using truncated bytes is collision-prone; full hash is not.
 */
function tokenId(tokenBytes: Uint8Array): string {
  return createHash('sha256').update(tokenBytes).digest('hex');
}

/**
 * Check and mark a token as spent. Returns false if already spent.
 * Persists to disk for crash-safe double-spend prevention.
 */
export function redeemToken(tokenBytes: Uint8Array): boolean {
  loadSpentTokens();

  const id = tokenId(tokenBytes);
  if (spentTokens.has(id)) return false;

  spentTokens.set(id, { redeemedAt: Date.now() });
  saveSpentTokens();
  return true;
}

/**
 * Reset spent tokens (for testing).
 */
export function _resetSpentTokens(): void {
  spentTokens = new Map();
  spentTokensLoaded = false;
}

// ── Constants ────────────────────────────────────────────────────

export { ISSUER_NAME, ORIGIN_NAME, BlindRSAMode, BLIND_RSA };
export { publicVerif };
