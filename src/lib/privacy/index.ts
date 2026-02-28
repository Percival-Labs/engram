// ── Privacy Layer ────────────────────────────────────────────────
// Content anonymization for external LLM API calls.
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
} from './types';
export { getDefaultPrivacyConfig } from './types';
