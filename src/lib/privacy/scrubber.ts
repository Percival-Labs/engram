// ── Content Scrubber ─────────────────────────────────────────────
// PII detection and redaction for outbound LLM requests.
// Strips identifying information, replaces with placeholders,
// and can restore originals in responses.

import type { ChatMessage } from '../providers/types';
import type {
  RedactionRule,
  RedactionMap,
  ScrubResult,
  PrivacyLevel,
  UserRedactionRule,
} from './types';

// ── Built-in Redaction Rules ─────────────────────────────────────

const RULES_MINIMAL: RedactionRule[] = [
  {
    name: 'api-key-openai',
    pattern: /sk-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    name: 'api-key-anthropic',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    name: 'api-key-aws',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    name: 'api-key-github',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'api-key-generic',
    pattern: /(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?([a-zA-Z0-9_\-./+=]{16,})['"]?/gi,
    replacement: '[REDACTED_SECRET]',
  },
  {
    name: 'ssn',
    // Exclude SSN-like patterns that are clearly not SSNs (000, 666, 900-999 area numbers)
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
  },
  {
    name: 'credit-card',
    pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    replacement: '[REDACTED_CARD]',
    validate: passesLuhn,
  },
];

const RULES_STANDARD: RedactionRule[] = [
  ...RULES_MINIMAL,
  {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    name: 'phone-us',
    // Require separator or parentheses to avoid matching random 10-digit numbers
    pattern: /(?:\+1[-.\s])?\(\d{3}\)[-.\s]?\d{3}[-.\s]\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    name: 'ip-address',
    // Only match valid octets (0-255)
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: '[REDACTED_IP]',
  },
  {
    name: 'home-path',
    pattern: /\/(?:Users|home)\/[a-zA-Z0-9._-]+/g,
    replacement: '/Users/[REDACTED_USER]',
  },
];

const RULES_AGGRESSIVE: RedactionRule[] = [
  ...RULES_STANDARD,
  {
    name: 'url-with-auth',
    pattern: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
    replacement: '[REDACTED_AUTH_URL]',
  },
  {
    name: 'bearer-token',
    pattern: /Bearer\s+[a-zA-Z0-9._\-/+=]{10,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  {
    name: 'private-key-block',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    name: 'nsec',
    pattern: /nsec1[a-z0-9]{58}/g,
    replacement: '[REDACTED_NSEC]',
  },
  {
    name: 'hex-private-key',
    pattern: /(?:private[_\s]?key|secret)\s*[:=]\s*['"]?([0-9a-f]{64})['"]?/gi,
    replacement: '[REDACTED_HEX_KEY]',
  },
];

// ── Rule Selection ───────────────────────────────────────────────

export function getRulesForLevel(level: PrivacyLevel): RedactionRule[] {
  switch (level) {
    case 'minimal': return RULES_MINIMAL.map(cloneRule);
    case 'standard': return RULES_STANDARD.map(cloneRule);
    case 'aggressive': return RULES_AGGRESSIVE.map(cloneRule);
  }
}

function cloneRule(rule: RedactionRule): RedactionRule {
  return { ...rule, pattern: new RegExp(rule.pattern.source, rule.pattern.flags) };
}

/**
 * Check if a regex pattern is potentially vulnerable to ReDoS.
 * Rejects patterns with nested quantifiers or overlapping alternation.
 */
function isReDoSSafe(pattern: string): boolean {
  // Reject nested quantifiers: (a+)+ , (a*)+, (a+)*, etc.
  if (/([+*])\)?[+*{]/.test(pattern)) return false;
  // Reject overlapping character classes with quantifiers: (a|a)+
  if (/\([^)]*\|[^)]*\)[+*{]/.test(pattern)) return false;
  return true;
}

/**
 * Luhn checksum validation for credit card numbers.
 * Returns true if the number passes the Luhn algorithm.
 */
function passesLuhn(digits: string): boolean {
  const nums = digits.replace(/\D/g, '');
  if (nums.length < 13 || nums.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function compileUserRules(userRules: UserRedactionRule[]): RedactionRule[] {
  return userRules
    .filter(r => {
      if (!isReDoSSafe(r.pattern)) {
        console.warn(`[Privacy] Skipping user rule "${r.name}": pattern may be vulnerable to ReDoS`);
        return false;
      }
      return true;
    })
    .map(r => ({
      name: r.name,
      pattern: new RegExp(r.pattern, 'gi'),
      replacement: r.replacement,
    }));
}

// ── Scrub Engine ─────────────────────────────────────────────────

/**
 * Scrub PII from chat messages using the given rules.
 * Returns scrubbed messages + a redaction map for restore.
 *
 * Each redacted value gets a unique placeholder ID so overlapping
 * matches don't collide during restore.
 */
export function scrub(
  messages: ChatMessage[],
  rules: RedactionRule[],
): ScrubResult {
  const redactions: RedactionMap = new Map();
  const stats: Record<string, number> = {};
  let counter = 0;

  function redact(text: string): string {
    let result = text;

    for (const rule of rules) {
      // Reset regex state for each text block
      rule.pattern.lastIndex = 0;

      result = result.replace(rule.pattern, (match) => {
        if (rule.validate && !rule.validate(match)) return match;
        const id = `__REDACTED_${counter++}__`;
        redactions.set(id, match);
        stats[rule.name] = (stats[rule.name] ?? 0) + 1;
        return `${rule.replacement}`;
      });
    }

    return result;
  }

  const scrubbed: ChatMessage[] = messages.map(msg => ({
    role: msg.role,
    content: redact(msg.content),
  }));

  return {
    messages: scrubbed,
    redactions,
    stats: {
      totalRedactions: redactions.size,
      byRule: stats,
    },
  };
}

/**
 * Restore redacted placeholders in a response string.
 * Used to re-contextualize LLM responses that reference
 * scrubbed content.
 *
 * Note: This is best-effort. If the LLM generates text that
 * references redacted content by the replacement label (e.g.,
 * "[REDACTED_EMAIL]"), we can't know which original to restore.
 * The redaction map tracks exact placeholder IDs.
 *
 * SECURITY: Always call clearRedactions() after restore to
 * prevent PII from lingering in memory.
 */
export function restore(text: string, redactions: RedactionMap): string {
  let result = text;

  for (const [id, original] of redactions) {
    result = result.replaceAll(id, original);
  }

  // Clear PII from memory after restore
  clearRedactions(redactions);

  return result;
}

/**
 * Explicitly clear a redaction map to remove PII from memory.
 * Called automatically by restore(), but can be called manually
 * when restoreResponses is disabled (redactions never restored).
 */
export function clearRedactions(redactions: RedactionMap): void {
  redactions.clear();
}
