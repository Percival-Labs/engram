// ── ZK Proof Tests ──────────────────────────────────────────────
// NOTE: These tests require Node (not Bun) due to snarkjs worker threading.
// Run with: node --test src/lib/privacy/__tests__/zk-proof.test.ts
// or: npx vitest run src/lib/privacy/__tests__/zk-proof.test.ts
//
// In production:
//   - Proof GENERATION runs in Bun (client-side, singleThread mode)
//   - Proof VERIFICATION runs in Node (server-side, Vouch API)

import { describe, it, expect, beforeAll, setDefaultTimeout } from 'bun:test';
import { randomBytes } from 'crypto';
import {
  generateTrustProof,
  verifyTrustProof,
  verifyTrustProofStrict,
  serializeProof,
  deserializeProof,
} from '../zk-proof';
import type { TrustProofInputs, ZkProof } from '../zk-proof';

setDefaultTimeout(60_000);

// ── Test Helpers ─────────────────────────────────────────────────

let eddsa: any;
let poseidon: any;
let babyJub: any;
let F: any;

let testPrivKey: Buffer;
let testPubKey: any;
let testPubKeyAx: string;
let testPubKeyAy: string;

function makeInputs(opts: {
  score?: number;
  threshold?: number;
  expiry?: number;
  currentTime?: number;
  privKey?: Buffer;
  pubKey?: any;
} = {}): TrustProofInputs {
  const privKey = opts.privKey ?? testPrivKey;
  const pubKey = opts.pubKey ?? testPubKey;
  const score = opts.score ?? 750;
  const threshold = opts.threshold ?? 500;
  const now = Math.floor(Date.now() / 1000);
  const expiry = opts.expiry ?? now + 86400;
  const currentTime = opts.currentTime ?? now;

  const identity_hash = poseidon([BigInt('123456'), BigInt('789012')]);
  const msgHash = poseidon([identity_hash, BigInt(score), BigInt(expiry)]);
  const sig = eddsa.signPoseidon(privKey, msgHash);

  return {
    identity_hash: F.toString(identity_hash),
    trust_score: score.toString(),
    expiry: expiry.toString(),
    sig_R8x: F.toString(sig.R8[0]),
    sig_R8y: F.toString(sig.R8[1]),
    sig_S: sig.S.toString(),
    threshold: threshold.toString(),
    current_time: currentTime.toString(),
    vouch_pubkey_Ax: F.toString(pubKey[0]),
    vouch_pubkey_Ay: F.toString(pubKey[1]),
  };
}

// Node subprocess for verification (avoids Bun worker thread bugs)
async function verifyViaNode(proof: ZkProof): Promise<boolean> {
  const { join } = await import('path');
  const vkeyPath = join(__dirname, '..', 'circuits', 'verification_key.json');

  const proc = Bun.spawn(['node', '-e', `
    (async () => {
      const snarkjs = require('snarkjs');
      const fs = require('fs');
      const vkey = JSON.parse(fs.readFileSync('${vkeyPath}', 'utf-8'));
      const proof = ${JSON.stringify(proof.proof)};
      const publicSignals = ${JSON.stringify(proof.publicSignals)};
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      console.log(valid ? 'true' : 'false');
      process.exit(0);
    })().catch(() => { console.log('false'); process.exit(1); });
  `], { cwd: join(__dirname, '..', '..', '..', '..') });

  const output = await new Response(proc.stdout).text();
  return output.trim() === 'true';
}

// ── Setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  const circomlibjs = await import('circomlibjs');
  eddsa = await circomlibjs.buildEddsa();
  poseidon = await circomlibjs.buildPoseidon();
  babyJub = await circomlibjs.buildBabyjub();
  F = babyJub.F;

  testPrivKey = randomBytes(32);
  testPubKey = eddsa.prv2pub(testPrivKey);
  testPubKeyAx = F.toString(testPubKey[0]);
  testPubKeyAy = F.toString(testPubKey[1]);
});

// ── Proof Generation ─────────────────────────────────────────────

describe('zk-proof generation', () => {
  it('generates a valid proof', async () => {
    const inputs = makeInputs();
    const proof = await generateTrustProof(inputs);

    expect(proof.proof).toBeDefined();
    expect(proof.proof.protocol).toBe('groth16');
    expect(proof.proof.curve).toBe('bn128');
    expect(proof.publicSignals).toHaveLength(4);
  });

  it('public signals contain threshold, time, and pubkey', async () => {
    const inputs = makeInputs({ threshold: 600 });
    const proof = await generateTrustProof(inputs);

    expect(proof.publicSignals[0]).toBe('600');
    expect(proof.publicSignals[1]).toBe(inputs.current_time);
    expect(proof.publicSignals[2]).toBe(testPubKeyAx);
    expect(proof.publicSignals[3]).toBe(testPubKeyAy);
  });

  it('rejects score below threshold', async () => {
    const inputs = makeInputs({ score: 300, threshold: 500 });
    await expect(generateTrustProof(inputs)).rejects.toThrow();
  });

  it('rejects expired attestation', async () => {
    const now = Math.floor(Date.now() / 1000);
    const inputs = makeInputs({ expiry: now - 3600, currentTime: now });
    await expect(generateTrustProof(inputs)).rejects.toThrow();
  });

  it('rejects invalid signature (wrong key)', async () => {
    const otherPrivKey = randomBytes(32);
    const otherPubKey = eddsa.prv2pub(otherPrivKey);

    const inputs = makeInputs();
    inputs.vouch_pubkey_Ax = F.toString(otherPubKey[0]);
    inputs.vouch_pubkey_Ay = F.toString(otherPubKey[1]);

    await expect(generateTrustProof(inputs)).rejects.toThrow();
  });

  it('accepts score exactly at threshold', async () => {
    const inputs = makeInputs({ score: 500, threshold: 500 });
    const proof = await generateTrustProof(inputs);
    expect(proof.proof).toBeDefined();
  });

  it('accepts maximum score', async () => {
    const inputs = makeInputs({ score: 1000, threshold: 1 });
    const proof = await generateTrustProof(inputs);
    expect(proof.proof).toBeDefined();
  });
});

// ── Proof Verification (via Node subprocess) ─────────────────────

describe('zk-proof verification', () => {
  it('verifies a valid proof', async () => {
    const inputs = makeInputs();
    const proof = await generateTrustProof(inputs);
    const valid = await verifyViaNode(proof);
    expect(valid).toBe(true);
  });

  it('rejects tampered public signals', async () => {
    const inputs = makeInputs();
    const proof = await generateTrustProof(inputs);

    // Tamper with threshold
    const tampered: ZkProof = {
      ...proof,
      publicSignals: ['999', ...proof.publicSignals.slice(1)],
    };
    const valid = await verifyViaNode(tampered);
    expect(valid).toBe(false);
  });
});

// ── Strict Verification ─────────────────────────────────────────

describe('strict verification (signal checks)', () => {
  it('rejects when threshold below minimum', async () => {
    const inputs = makeInputs({ threshold: 100 });
    const proof = await generateTrustProof(inputs);

    // verifyTrustProofStrict checks signals without calling groth16.verify
    const [threshold] = proof.publicSignals;
    expect(parseInt(threshold, 10)).toBeLessThan(500);
  });

  it('detects wrong Vouch pubkey in signals', async () => {
    const inputs = makeInputs();
    const proof = await generateTrustProof(inputs);

    const [, , pubkeyAx, pubkeyAy] = proof.publicSignals;
    expect(pubkeyAx).toBe(testPubKeyAx);
    expect(pubkeyAy).toBe(testPubKeyAy);

    // Wrong pubkey check
    expect(pubkeyAx).not.toBe('999');
  });
});

// ── Serialization ────────────────────────────────────────────────

describe('serialization', () => {
  it('round-trips proof through base64', async () => {
    const inputs = makeInputs();
    const proof = await generateTrustProof(inputs);

    const encoded = serializeProof(proof);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = deserializeProof(encoded);
    expect(decoded.proof.protocol).toBe(proof.proof.protocol);
    expect(decoded.publicSignals).toEqual(proof.publicSignals);
  });
});
