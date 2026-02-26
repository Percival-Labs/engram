// ── Quality Validator ─────────────────────────────────────────────
// Deterministic quality validation — no LLM calls.
// Used by cascade executor to decide whether to escalate.

import type { TaskComplexity, QualityCheck } from './types';

// ── Refusal patterns ─────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  /^i (?:can't|cannot|am not able to|'m not able to)/i,
  /^as an ai/i,
  /^i don't have (?:the ability|access)/i,
  /^sorry,? (?:but )?i (?:can't|cannot)/i,
  /^unfortunately,? i (?:can't|cannot)/i,
  /^i'?m (?:just )?an? (?:ai|language model)/i,
];

// ── Minimum expected response lengths by complexity ──────────────

const MIN_LENGTHS: Record<TaskComplexity, number> = {
  trivial: 5,
  simple: 20,
  moderate: 50,
  complex: 100,
  expert: 150,
};

// ── Code request detection ───────────────────────────────────────

function askedForCode(query: string): boolean {
  return /(?:write|create|generate|implement|code|function|class|script|program)\b/i.test(query);
}

function hasCodeBlock(response: string): boolean {
  return /```/.test(response);
}

// ── Keyword overlap (coherence check) ────────────────────────────

function keywordOverlap(query: string, response: string): number {
  const queryWords = new Set(
    query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3) // Skip short words
  );

  if (queryWords.size === 0) return 1.0; // Nothing to check against

  const responseText = response.toLowerCase();
  let matches = 0;

  for (const word of queryWords) {
    if (responseText.includes(word)) matches++;
  }

  return matches / queryWords.size;
}

// ── Main validator ───────────────────────────────────────────────

export function validateResponse(
  query: string,
  response: string,
  complexity: TaskComplexity,
): QualityCheck {
  const reasons: string[] = [];
  const scores: number[] = [];

  // 1. Length check
  const minLen = MIN_LENGTHS[complexity];
  const responseLen = response.trim().length;
  if (responseLen < minLen) {
    reasons.push(`Response too short (${responseLen} chars, expected >=${minLen})`);
    scores.push(0.3);
  } else {
    scores.push(1.0);
  }

  // 2. Refusal detection
  const trimmed = response.trim();
  const isRefusal = REFUSAL_PATTERNS.some(p => p.test(trimmed));
  if (isRefusal) {
    reasons.push('Response appears to be a refusal');
    scores.push(0.1);
  } else {
    scores.push(1.0);
  }

  // 3. Format compliance (code block present if code was requested)
  if (askedForCode(query) && !hasCodeBlock(response) && complexity !== 'trivial') {
    reasons.push('Code was requested but no code block found');
    scores.push(0.4);
  } else {
    scores.push(1.0);
  }

  // 4. Query-response coherence
  const overlap = keywordOverlap(query, response);
  if (overlap < 0.2 && complexity !== 'trivial') {
    reasons.push(`Low query-response coherence (${(overlap * 100).toFixed(0)}%)`);
    scores.push(0.3 + overlap);
  } else {
    scores.push(0.8 + overlap * 0.2);
  }

  // 5. Empty or whitespace-only
  if (responseLen === 0) {
    reasons.push('Empty response');
    scores.push(0.0);
  }

  // Weighted average
  const weights = [0.2, 0.3, 0.2, 0.2, 0.1]; // refusal weighted highest
  let score = 0;
  let totalWeight = 0;
  for (let i = 0; i < scores.length; i++) {
    const w = weights[i] ?? 0.1;
    score += scores[i] * w;
    totalWeight += w;
  }
  score = totalWeight > 0 ? score / totalWeight : 0;

  return {
    pass: reasons.length === 0 && score >= 0.7,
    score: Math.round(score * 100) / 100,
    reasons,
  };
}
