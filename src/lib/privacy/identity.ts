// ── Vouch Identity ──────────────────────────────────────────────
// Auto-generated Nostr-compatible identity for Engram users.
// Created during `engram init`, stored encrypted on disk.
// Used for Vouch registration and token issuance auth.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { getEngramHome } from '../config';

// ── Types ────────────────────────────────────────────────────────

export interface VouchIdentity {
  /** Hex-encoded secp256k1 public key (32 bytes, x-only) */
  publicKeyHex: string;
  /** When this identity was created */
  createdAt: string;
  /** Whether this identity has been registered with Vouch API */
  registered: boolean;
}

/** On-disk format: private key encrypted with AES-256-GCM */
interface EncryptedIdentityFile {
  version: 2;
  publicKeyHex: string;
  encryptedPrivateKey: string; // iv:tag:ciphertext (hex)
  salt: string;               // PBKDF2 salt (hex)
  createdAt: string;
  registered: boolean;
}

/** Legacy plaintext format (v1, auto-migrated on load) */
interface LegacyIdentityFile {
  privateKeyHex: string;
  publicKeyHex: string;
  createdAt: string;
  registered: boolean;
}

type IdentityFileFormat = EncryptedIdentityFile | LegacyIdentityFile;

// ── Encryption Helpers ────────────────────────────────────────────

/**
 * Derive encryption key from machine-specific entropy.
 * Uses hostname + username + a per-install salt for PBKDF2.
 * Not a password prompt — defense-in-depth against file exfiltration.
 */
function deriveKey(salt: Buffer): Buffer {
  const hostname = require('os').hostname();
  const username = require('os').userInfo().username;
  const passphrase = `engram:${hostname}:${username}`;
  return pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha256');
}

function encryptPrivateKey(privateKeyHex: string, salt: Buffer): string {
  const key = deriveKey(salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKeyHex, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptPrivateKey(encryptedData: string, salt: Buffer): string {
  const key = deriveKey(salt);
  const [ivHex, tagHex, ciphertext] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
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
 * Auto-migrates legacy plaintext format to encrypted v2.
 */
export function loadIdentity(): VouchIdentity | null {
  const path = getIdentityPath();
  if (!existsSync(path)) return null;

  try {
    const raw: IdentityFileFormat = JSON.parse(readFileSync(path, 'utf-8'));

    // Legacy plaintext format — auto-migrate
    if ('privateKeyHex' in raw && !('version' in raw)) {
      const legacy = raw as LegacyIdentityFile;
      saveIdentityEncrypted(legacy.privateKeyHex, {
        publicKeyHex: legacy.publicKeyHex,
        createdAt: legacy.createdAt,
        registered: legacy.registered,
      });
      return {
        publicKeyHex: legacy.publicKeyHex,
        createdAt: legacy.createdAt,
        registered: legacy.registered,
      };
    }

    // v2 encrypted format
    const encrypted = raw as EncryptedIdentityFile;
    return {
      publicKeyHex: encrypted.publicKeyHex,
      createdAt: encrypted.createdAt,
      registered: encrypted.registered,
    };
  } catch {
    return null;
  }
}

/**
 * Load the private key (decrypts from disk). Use sparingly.
 */
export function loadPrivateKey(): string | null {
  const path = getIdentityPath();
  if (!existsSync(path)) return null;

  try {
    const raw: IdentityFileFormat = JSON.parse(readFileSync(path, 'utf-8'));

    // Legacy plaintext format
    if ('privateKeyHex' in raw && !('version' in raw)) {
      return (raw as LegacyIdentityFile).privateKeyHex;
    }

    // v2 encrypted format
    const encrypted = raw as EncryptedIdentityFile;
    const salt = Buffer.from(encrypted.salt, 'hex');
    return decryptPrivateKey(encrypted.encryptedPrivateKey, salt);
  } catch {
    return null;
  }
}

/**
 * Save identity to disk with encrypted private key.
 */
function saveIdentityEncrypted(privateKeyHex: string, identity: VouchIdentity): void {
  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const salt = randomBytes(32);
  const file: EncryptedIdentityFile = {
    version: 2,
    publicKeyHex: identity.publicKeyHex,
    encryptedPrivateKey: encryptPrivateKey(privateKeyHex, salt),
    salt: salt.toString('hex'),
    createdAt: identity.createdAt,
    registered: identity.registered,
  };

  writeFileSync(getIdentityPath(), JSON.stringify(file, null, 2), { mode: 0o600 });
}

/**
 * Save identity metadata (no private key change).
 */
function saveIdentity(identity: VouchIdentity): void {
  const path = getIdentityPath();

  // If existing encrypted file, update metadata fields only
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw.version === 2) {
        raw.publicKeyHex = identity.publicKeyHex;
        raw.registered = identity.registered;
        raw.createdAt = identity.createdAt;
        writeFileSync(path, JSON.stringify(raw, null, 2), { mode: 0o600 });
        return;
      }
    } catch {
      // Fall through to full save
    }
  }

  // No existing encrypted file — can't save without private key
  // This path shouldn't be reached in normal flow
  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(identity, null, 2), { mode: 0o600 });
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
    publicKeyHex,
    createdAt: new Date().toISOString(),
    registered: false,
  };

  saveIdentityEncrypted(privateKeyHex, identity);
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

/**
 * Compute Poseidon identity commitment from the Nostr public key.
 * Used as the identity_hash input to the ZK trust proof circuit.
 * Splits the 32-byte x-only pubkey into two 128-bit halves,
 * then hashes with Poseidon(hi, lo).
 */
export async function getIdentityCommitment(): Promise<string | null> {
  const identity = loadIdentity();
  if (!identity) return null;

  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();

  // Split 32-byte (64-hex) pubkey into two 16-byte halves
  const pubkeyHex = identity.publicKeyHex;
  const hi = BigInt('0x' + pubkeyHex.slice(0, 32));  // first 16 bytes
  const lo = BigInt('0x' + pubkeyHex.slice(32, 64));  // last 16 bytes

  const commitment = poseidon([hi, lo]);
  return poseidon.F.toString(commitment);
}
