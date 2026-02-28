// ── Privacy Layer ────────────────────────────────────────────────
// Content anonymization + identity unlinkability for external LLM calls.
// Phase 1: Content scrubbing (PII redaction)
// Phase 2: Blind-signed tokens (request unlinkability)
// Local providers (Ollama) bypass entirely.

export { scrub, restore } from './scrubber';
export type {
  PrivacyConfig,
  PrivacyLevel,
  ProviderPrivacy,
  RedactionRule,
  RedactionMap,
  ScrubResult,
  UserRedactionRule,
  TokenConfig,
  ZkProofConfig,
} from './types';
export { getDefaultPrivacyConfig } from './types';

// Token layer (Phase 2)
export {
  requestTokenBatch,
  popToken,
  getTokenCount,
  needsRefresh,
  maybeRefresh,
  initTokenManager,
} from './tokens';

// Issuer (for self-hosted deployments)
export {
  generateIssuerKeys,
  loadOrCreateIssuerKeys,
  createIssuer,
  issueToken,
  verifyToken,
  redeemToken,
} from './issuer';

// Identity (Vouch-compatible Nostr keypair)
export {
  initIdentity,
  loadIdentity,
  registerWithVouch,
  getPublicKeyHex,
  getIdentityCommitment,
} from './identity';

// ZK Trust Proofs (Phase 3)
export {
  generateTrustProof,
  generateCachedTrustProof,
  verifyTrustProof,
  verifyTrustProofStrict,
  loadCachedProof,
  serializeProof,
  deserializeProof,
} from './zk-proof';
export type {
  TrustProofInputs,
  ZkProof,
  ZkProofCached,
} from './zk-proof';

// Vouch Proof Orchestration (Phase 3)
export {
  fetchAttestation,
  getOrGenerateProof,
  hasCachedProof,
  buildZkAuthHeader,
} from './vouch-proof';
export type { VouchAttestation } from './vouch-proof';
