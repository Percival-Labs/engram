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
} from './identity';
