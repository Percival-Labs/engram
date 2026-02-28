// ── ZK Proof Generation & Verification ──────────────────────────
// Wraps snarkjs Groth16 for Trust Proof circuit.
// Proves "I have a valid Vouch attestation with score >= threshold"
// without revealing identity, exact score, or signature.
//
// Circuit artifacts (.wasm + .zkey) are loaded from local build or
// downloaded on first use from GitHub Releases.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getEngramHome } from '../config';

// ── Types ────────────────────────────────────────────────────────

export interface TrustProofInputs {
  // Private (hidden from verifier)
  identity_hash: string;   // Poseidon(pubkey_hi, pubkey_lo) as decimal string
  trust_score: string;     // 0-1000 as decimal string
  expiry: string;          // Unix timestamp as decimal string
  sig_R8x: string;         // EdDSA signature R8.x as decimal string
  sig_R8y: string;         // EdDSA signature R8.y as decimal string
  sig_S: string;           // EdDSA signature S as decimal string
  // Public (visible to verifier)
  threshold: string;       // Minimum score as decimal string
  current_time: string;    // Current unix timestamp as decimal string
  vouch_pubkey_Ax: string; // Vouch BJJ public key A.x as decimal string
  vouch_pubkey_Ay: string; // Vouch BJJ public key A.y as decimal string
}

export interface ZkProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export interface ZkProofCached extends ZkProof {
  generatedAt: number;
  expiresAt: number;
  threshold: number;
}

// ── BN128 Curve Init (Bun Compatibility) ─────────────────────────
// snarkjs spawns web workers for FFT, which crashes Bun.
// Pre-building the BN128 curve in single-threaded mode and caching
// it in globalThis ensures all snarkjs operations reuse it.

let curveInitPromise: Promise<void> | null = null;

async function ensureSingleThreadCurve(): Promise<void> {
  if ((globalThis as any).curve_bn128) return;
  if (curveInitPromise) return curveInitPromise;

  curveInitPromise = (async () => {
    const { buildBn128 } = await import('ffjavascript');
    const curve = await buildBn128(true); // singleThread = true
    (globalThis as any).curve_bn128 = curve;
  })();

  return curveInitPromise;
}

// ── Artifact Paths ───────────────────────────────────────────────

const CIRCUITS_DIR = join(__dirname, 'circuits');
const ARTIFACTS_DIR_NAME = 'zk-artifacts';

function getArtifactsDir(): string {
  return join(getEngramHome(), 'privacy', ARTIFACTS_DIR_NAME);
}

function getWasmPath(): string {
  // Prefer local build artifacts (dev), fall back to downloaded
  const local = join(CIRCUITS_DIR, 'trust-proof_js', 'trust-proof.wasm');
  if (existsSync(local)) return local;
  return join(getArtifactsDir(), 'trust-proof.wasm');
}

function getZkeyPath(): string {
  const local = join(CIRCUITS_DIR, 'trust-proof_final.zkey');
  if (existsSync(local)) return local;
  return join(getArtifactsDir(), 'trust-proof_final.zkey');
}

function getVkeyPath(): string {
  // Verification key is small enough to ship in npm
  const bundled = join(CIRCUITS_DIR, 'verification_key.json');
  if (existsSync(bundled)) return bundled;
  return join(getArtifactsDir(), 'verification_key.json');
}

// ── Artifact Download + Integrity Verification ───────────────────

const ARTIFACTS_BASE_URL = 'https://github.com/Percival-Labs/engram-zk-artifacts/releases/download/v1.0.0';

/** SHA-256 hashes of trusted circuit artifacts — pinned at build time. */
const ARTIFACT_HASHES: Record<string, string> = {
  'trust-proof.wasm': '84ab26681743c1c95736da5276f04698b63f824491c50484d2e902ffe51c658c',
  'trust-proof_final.zkey': '2be2f8342288a61e797828f5f747ed5d3e7c2d959a918f5190d338b4ec616b1e',
  'verification_key.json': '51ad1beb003ae2809bedf261846b7703a16b36821162dee53fcfa921e374c0df',
};

let downloadLock: Promise<void> | null = null;

async function ensureArtifacts(): Promise<void> {
  const wasmPath = getWasmPath();
  const zkeyPath = getZkeyPath();

  if (existsSync(wasmPath) && existsSync(zkeyPath)) return;

  // Prevent concurrent downloads (race condition)
  if (downloadLock) return downloadLock;
  downloadLock = doDownloadArtifacts().finally(() => { downloadLock = null; });
  return downloadLock;
}

async function doDownloadArtifacts(): Promise<void> {
  const dir = getArtifactsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const downloads: { url: string; dest: string; filename: string }[] = [];

  const wasmPath = getWasmPath();
  if (!existsSync(wasmPath)) {
    downloads.push({
      url: `${ARTIFACTS_BASE_URL}/trust-proof.wasm`,
      dest: join(dir, 'trust-proof.wasm'),
      filename: 'trust-proof.wasm',
    });
  }

  const zkeyPath = getZkeyPath();
  if (!existsSync(zkeyPath)) {
    downloads.push({
      url: `${ARTIFACTS_BASE_URL}/trust-proof_final.zkey`,
      dest: join(dir, 'trust-proof_final.zkey'),
      filename: 'trust-proof_final.zkey',
    });
  }

  const vkeyPath = getVkeyPath();
  if (!existsSync(vkeyPath)) {
    downloads.push({
      url: `${ARTIFACTS_BASE_URL}/verification_key.json`,
      dest: join(dir, 'verification_key.json'),
      filename: 'verification_key.json',
    });
  }

  for (const { url, dest, filename } of downloads) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download circuit artifact: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Verify integrity before writing (supply chain protection)
    const hash = createHash('sha256').update(buffer).digest('hex');
    const expectedHash = ARTIFACT_HASHES[filename];
    if (expectedHash && hash !== expectedHash) {
      throw new Error(
        `Artifact integrity check failed for ${filename}`,
      );
    }

    // Atomic write: temp file then rename
    const tmpDest = dest + '.tmp';
    writeFileSync(tmpDest, buffer, { mode: 0o600 });
    renameSync(tmpDest, dest);
  }
}

// ── Input Validation ─────────────────────────────────────────────

const BN128_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function validateInputs(inputs: TrustProofInputs): void {
  for (const [key, val] of Object.entries(inputs)) {
    if (typeof val !== 'string' || !/^\d+$/.test(val)) {
      throw new Error(`Invalid ZK input ${key}: must be a non-negative decimal string`);
    }
    if (BigInt(val) >= BN128_PRIME) {
      throw new Error(`ZK input ${key} exceeds BN128 field modulus`);
    }
  }

  // Domain-specific range checks (match circuit constraints)
  const score = parseInt(inputs.trust_score, 10);
  if (score > 1000) {
    throw new Error(`trust_score ${score} exceeds maximum (1000)`);
  }
  const threshold = parseInt(inputs.threshold, 10);
  if (threshold > 1000) {
    throw new Error(`threshold ${threshold} exceeds maximum (1000)`);
  }
}

// ── Proof Cache ──────────────────────────────────────────────────

function getCachePath(): string {
  return join(getEngramHome(), 'privacy', 'zk-proof-cache.json');
}

export function loadCachedProof(threshold: number): ZkProofCached | null {
  const path = getCachePath();
  if (!existsSync(path)) return null;

  try {
    const cached: ZkProofCached = JSON.parse(readFileSync(path, 'utf-8'));
    const now = Math.floor(Date.now() / 1000);

    // Check not expired and threshold matches
    if (cached.expiresAt > now && cached.threshold === threshold) {
      return cached;
    }
  } catch {
    // Corrupt cache — ignore
  }

  return null;
}

function saveCachedProof(proof: ZkProof, threshold: number, ttlSecs: number): ZkProofCached {
  const now = Math.floor(Date.now() / 1000);
  const cached: ZkProofCached = {
    ...proof,
    generatedAt: now,
    expiresAt: now + ttlSecs,
    threshold,
  };

  const dir = join(getEngramHome(), 'privacy');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(getCachePath(), JSON.stringify(cached, null, 2), { mode: 0o600 });

  return cached;
}

// ── Proof Generation ─────────────────────────────────────────────

let proofGenLock: Promise<ZkProof> | null = null;

/**
 * Generate a Groth16 proof for the Trust Proof circuit.
 * Proves that a valid Vouch attestation exists with score >= threshold.
 *
 * Uses single-threaded mode for Bun compatibility.
 * Serialized — only one proof generation at a time (CPU protection).
 */
export async function generateTrustProof(inputs: TrustProofInputs): Promise<ZkProof> {
  validateInputs(inputs);

  // Serialize proof generation (CPU-intensive, ~1.5-10s)
  if (proofGenLock) await proofGenLock;

  const promise = doGenerateProof(inputs);
  proofGenLock = promise;
  try {
    return await promise;
  } finally {
    proofGenLock = null;
  }
}

async function doGenerateProof(inputs: TrustProofInputs): Promise<ZkProof> {
  await ensureSingleThreadCurve();
  await ensureArtifacts();

  // Dynamic import — snarkjs is CommonJS
  const snarkjs = await import('snarkjs');

  const wasmPath = getWasmPath();
  const zkeyPath = getZkeyPath();

  // fullProve: generates witness from inputs + WASM, then creates Groth16 proof
  // singleThread: true avoids web-worker crashes in Bun (snarkjs uses threaded FFT by default)
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { ...inputs } as Record<string, string>,
    wasmPath,
    zkeyPath,
    undefined,     // logger
    undefined,     // wtnsCalcOptions
    { singleThread: true },  // proverOptions — Bun compatibility
  );

  return { proof, publicSignals };
}

/**
 * Generate a proof with caching.
 * Returns cached proof if valid, otherwise generates a new one.
 */
export async function generateCachedTrustProof(
  inputs: TrustProofInputs,
  cacheTtlSecs: number = 86400, // 24h default
): Promise<ZkProofCached> {
  const threshold = parseInt(inputs.threshold, 10);

  // Check cache first
  const cached = loadCachedProof(threshold);
  if (cached) return cached;

  // Generate fresh proof
  const proof = await generateTrustProof(inputs);
  return saveCachedProof(proof, threshold, cacheTtlSecs);
}

// ── Proof Verification ───────────────────────────────────────────

/**
 * Verify a Groth16 proof against the verification key.
 * Used by the issuer/proxy to check proofs before issuing tokens.
 */
export async function verifyTrustProof(proof: ZkProof): Promise<boolean> {
  await ensureSingleThreadCurve();
  const snarkjs = await import('snarkjs');

  const vkeyPath = getVkeyPath();
  if (!existsSync(vkeyPath)) {
    await ensureArtifacts();
  }

  const vkey = JSON.parse(readFileSync(vkeyPath, 'utf-8'));

  return snarkjs.groth16.verify(vkey, proof.publicSignals, proof.proof);
}

/**
 * Verify proof and check that public signals match expected values.
 * Stricter verification for the issuer side.
 */
export async function verifyTrustProofStrict(
  proof: ZkProof,
  expectedVouchPubkey: { Ax: string; Ay: string },
  minThreshold: number,
  maxTimeDriftSecs: number = 300, // 5 minutes
): Promise<{ valid: boolean; reason?: string }> {
  // 1. Verify the cryptographic proof
  const cryptoValid = await verifyTrustProof(proof);
  if (!cryptoValid) return { valid: false, reason: 'Invalid proof' };

  // Public signals order: [threshold, current_time, vouch_pubkey_Ax, vouch_pubkey_Ay]
  const [threshold, currentTime, pubkeyAx, pubkeyAy] = proof.publicSignals;

  // 2. Check threshold meets minimum
  if (parseInt(threshold, 10) < minThreshold) {
    return { valid: false, reason: `Threshold ${threshold} below minimum ${minThreshold}` };
  }

  // 3. Check timestamp is recent (not stale proof)
  const now = Math.floor(Date.now() / 1000);
  const proofTime = parseInt(currentTime, 10);
  if (Math.abs(now - proofTime) > maxTimeDriftSecs) {
    return { valid: false, reason: `Proof timestamp too far from current time` };
  }

  // 4. Check Vouch pubkey matches expected
  if (pubkeyAx !== expectedVouchPubkey.Ax || pubkeyAy !== expectedVouchPubkey.Ay) {
    return { valid: false, reason: 'Vouch public key mismatch' };
  }

  return { valid: true };
}

/**
 * Serialize a ZK proof for transport (e.g., Authorization header).
 */
export function serializeProof(proof: ZkProof): string {
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

/**
 * Deserialize a ZK proof from transport format.
 * Validates structure before returning.
 */
export function deserializeProof(encoded: string): ZkProof {
  const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));

  // Schema validation — reject malformed payloads
  if (
    !parsed?.proof?.pi_a ||
    !parsed?.proof?.pi_b ||
    !parsed?.proof?.pi_c ||
    !Array.isArray(parsed?.publicSignals)
  ) {
    throw new Error('Invalid ZK proof structure');
  }

  return parsed as ZkProof;
}
