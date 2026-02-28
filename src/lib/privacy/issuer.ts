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
import { getEngramHome } from '../config';

const { Issuer, Origin, getPublicKeyBytes, BlindRSAMode, BLIND_RSA } = publicVerif;

export type { Token } from '@cloudflare/privacypass-ts';

// ── Types ────────────────────────────────────────────────────────

export interface IssuerKeyPair {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
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
 */
export async function generateIssuerKeys(): Promise<IssuerKeyPair> {
  const keys = await Issuer.generateKey(BlindRSAMode.PSS, {
    modulusLength: 2048,
    publicExponent: Uint8Array.from([1, 0, 1]),
  });

  const keyPair: IssuerKeyPair = {
    privateKeyJwk: await exportKey(keys.privateKey),
    publicKeyJwk: await exportKey(keys.publicKey),
    createdAt: new Date().toISOString(),
  };

  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(getKeysPath(), JSON.stringify(keyPair, null, 2), { mode: 0o600 });

  return keyPair;
}

/**
 * Load existing issuer keys or generate new ones.
 */
export async function loadOrCreateIssuerKeys(): Promise<IssuerKeyPair> {
  const path = getKeysPath();
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
  return generateIssuerKeys();
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

// ── Double-Spend Tracking ────────────────────────────────────────

const spentTokens = new Set<string>();

function tokenId(tokenBytes: Uint8Array): string {
  // Use first 32 bytes of token as unique ID
  return Array.from(tokenBytes.slice(0, 32))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check and mark a token as spent. Returns false if already spent.
 */
export function redeemToken(tokenBytes: Uint8Array): boolean {
  const id = tokenId(tokenBytes);
  if (spentTokens.has(id)) return false;
  spentTokens.add(id);
  return true;
}

/**
 * Reset spent tokens (for testing).
 */
export function _resetSpentTokens(): void {
  spentTokens.clear();
}

// ── Constants ────────────────────────────────────────────────────

export { ISSUER_NAME, ORIGIN_NAME, BlindRSAMode, BLIND_RSA };
export { publicVerif };
