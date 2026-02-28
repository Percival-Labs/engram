// ── Vouch Proof Orchestration ────────────────────────────────────
// High-level API: fetch trust attestation from Vouch API,
// generate ZK proof locally, cache for reuse.
//
// Flow (once per 24h):
//   1. Authenticate with NIP-98 → Vouch API (identity revealed once)
//   2. Receive BJJ-signed attestation: {identity_hash, trust_score, expiry, sig}
//   3. Generate Groth16 ZK proof locally (~1.5s in Bun)
//   4. Cache proof to disk (valid until attestation expires)
//
// Flow (every token batch request):
//   1. Load cached proof (instant)
//   2. Send as Authorization: ZkProof <base64> to token issuer
//   3. Issuer verifies proof — cannot extract identity

import { existsSync, readFileSync } from 'fs';
import { getIdentityCommitment, loadIdentity } from './identity';
import {
  generateCachedTrustProof,
  loadCachedProof,
  serializeProof,
} from './zk-proof';
import type { TrustProofInputs, ZkProof, ZkProofCached } from './zk-proof';
import type { ZkProofConfig } from './types';

// ── Types ────────────────────────────────────────────────────────

export interface VouchAttestation {
  identity_hash: string;    // Poseidon(pubkey_hi, pubkey_lo) as decimal string
  trust_score: number;       // 0-1000
  expiry: number;            // Unix timestamp
  signature: {
    R8x: string;             // EdDSA R8.x as decimal string
    R8y: string;             // EdDSA R8.y as decimal string
    S: string;               // EdDSA S as decimal string
  };
  vouch_pubkey: {
    Ax: string;              // BJJ public key A.x as decimal string
    Ay: string;              // BJJ public key A.y as decimal string
  };
}

// ── Attestation Fetch ────────────────────────────────────────────

const VOUCH_API = 'https://percivalvouch-api-production.up.railway.app';

/**
 * Fetch a BJJ-signed trust attestation from the Vouch API.
 * Requires NIP-98 authentication (identity revealed to Vouch API).
 * This is the only point where identity is revealed — once per 24h.
 */
export async function fetchAttestation(
  nip98AuthHeader: string,
): Promise<VouchAttestation> {
  const res = await fetch(`${VOUCH_API}/v1/sdk/agents/me/zk-attestation`, {
    method: 'POST',
    headers: {
      'Authorization': nip98AuthHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Attestation request failed: ${res.status}`);
  }

  return res.json();
}

// ── Proof Orchestration ──────────────────────────────────────────

/**
 * Get or generate a ZK trust proof.
 * Checks cache first, fetches attestation + generates proof if needed.
 *
 * @param config ZK proof configuration (threshold, TTL)
 * @param nip98AuthHeader NIP-98 auth header for attestation fetch
 * @returns Serialized proof ready for Authorization header
 */
export async function getOrGenerateProof(
  config: ZkProofConfig,
  nip98AuthHeader: string,
): Promise<string> {
  const { threshold, attestationTtlSecs } = config;

  // 1. Check cache
  const cached = loadCachedProof(threshold);
  if (cached) {
    return serializeProof(cached);
  }

  // 2. Get identity commitment (Poseidon hash of pubkey)
  const identityHash = await getIdentityCommitment();
  if (!identityHash) {
    throw new Error('No Vouch identity found. Run `engram init` first.');
  }

  // 3. Fetch attestation from Vouch API (identity revealed once)
  const attestation = await fetchAttestation(nip98AuthHeader);

  // 3b. Verify identity hash matches local commitment (MITM/API bug protection)
  if (identityHash !== attestation.identity_hash) {
    throw new Error(
      'Identity hash mismatch: local commitment does not match attestation. ' +
      'This could indicate a compromised API response.',
    );
  }

  // 4. Build circuit inputs
  const now = Math.floor(Date.now() / 1000);
  const inputs: TrustProofInputs = {
    identity_hash: attestation.identity_hash,
    trust_score: attestation.trust_score.toString(),
    expiry: attestation.expiry.toString(),
    sig_R8x: attestation.signature.R8x,
    sig_R8y: attestation.signature.R8y,
    sig_S: attestation.signature.S,
    threshold: threshold.toString(),
    current_time: now.toString(),
    vouch_pubkey_Ax: attestation.vouch_pubkey.Ax,
    vouch_pubkey_Ay: attestation.vouch_pubkey.Ay,
  };

  // 5. Generate proof (with caching)
  const proof = await generateCachedTrustProof(inputs, attestationTtlSecs);

  return serializeProof(proof);
}

/**
 * Check if we have a valid cached proof for the given threshold.
 */
export function hasCachedProof(threshold: number): boolean {
  return loadCachedProof(threshold) !== null;
}

/**
 * Build the Authorization header value for a ZK proof.
 */
export function buildZkAuthHeader(serializedProof: string): string {
  return `ZkProof ${serializedProof}`;
}
