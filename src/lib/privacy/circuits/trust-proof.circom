pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// ── Trust Proof Circuit ─────────────────────────────────────────
// Proves: "I have a valid Vouch attestation where score >= threshold"
// without revealing identity, exact score, or attestation details.
//
// ~25K constraints. Hermez ptau_15 (32K max) is sufficient.
//
// Flow:
//   1. Vouch API signs {identity_hash, trust_score, expiry} with BJJ EdDSA
//   2. Client generates this proof locally (~4-10s in Bun/WASM)
//   3. Verifier checks proof — learns only that score >= threshold and not expired
//   4. Verifier cannot extract identity, exact score, or signature

template TrustProof() {
    // ── Private inputs (hidden from verifier) ───────────────────
    signal input identity_hash;    // Poseidon(pubkey_hi, pubkey_lo)
    signal input trust_score;      // 0-1000 composite score
    signal input expiry;           // Unix timestamp (seconds)
    signal input sig_R8x;          // EdDSA signature R8.x
    signal input sig_R8y;          // EdDSA signature R8.y
    signal input sig_S;            // EdDSA signature S

    // ── Public inputs (visible to verifier) ─────────────────────
    signal input threshold;        // Minimum acceptable score
    signal input current_time;     // Verifier's timestamp
    signal input vouch_pubkey_Ax;  // Vouch BJJ public key A.x
    signal input vouch_pubkey_Ay;  // Vouch BJJ public key A.y

    // ── 1. Hash the attestation message ─────────────────────────
    component msgHash = Poseidon(3);
    msgHash.inputs[0] <== identity_hash;
    msgHash.inputs[1] <== trust_score;
    msgHash.inputs[2] <== expiry;

    // ── 2. Verify Vouch's EdDSA signature ───────────────────────
    component sigVerify = EdDSAPoseidonVerifier();
    sigVerify.enabled <== 1;
    sigVerify.Ax <== vouch_pubkey_Ax;
    sigVerify.Ay <== vouch_pubkey_Ay;
    sigVerify.R8x <== sig_R8x;
    sigVerify.R8y <== sig_R8y;
    sigVerify.S <== sig_S;
    sigVerify.M <== msgHash.out;

    // ── 3. Range-check score and threshold ──────────────────────
    // Without explicit range checks, values >= 2^16 make
    // GreaterEqThan(16) unsound (Num2Bits decomposition
    // becomes unconstrained for out-of-range inputs).
    component scoreRange = LessThan(16);
    scoreRange.in[0] <== trust_score;
    scoreRange.in[1] <== 1001;  // score must be in [0, 1000]
    scoreRange.out === 1;

    component thresholdRange = LessThan(16);
    thresholdRange.in[0] <== threshold;
    thresholdRange.in[1] <== 1001;  // threshold must be in [0, 1000]
    thresholdRange.out === 1;

    // ── 4. Score meets threshold ────────────────────────────────
    component scoreCheck = GreaterEqThan(16);
    scoreCheck.in[0] <== trust_score;
    scoreCheck.in[1] <== threshold;
    scoreCheck.out === 1;

    // ── 5. Attestation not expired ──────────────────────────────
    component expiryCheck = LessThan(64);
    expiryCheck.in[0] <== current_time;
    expiryCheck.in[1] <== expiry;
    expiryCheck.out === 1;
}

component main {public [threshold, current_time, vouch_pubkey_Ax, vouch_pubkey_Ay]} = TrustProof();
