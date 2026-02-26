// ── Layer 1: Task Classifier ─────────────────────────────────────
// Pure heuristics, zero API calls, sub-millisecond.
// Classifies user messages by complexity to route to the right model tier.

import type { ChatMessage } from '../providers/types';
import type { TaskComplexity, ClassificationResult, ClassificationSignals } from './types';

// ── Cognitive verb sets (weighted by complexity) ─────────────────

const EXPERT_VERBS = new Set([
  'architect', 'design', 'prove', 'derive', 'formalize',
  'optimize', 'synthesize', 'evaluate', 'critique',
]);

const COMPLEX_VERBS = new Set([
  'analyze', 'compare', 'contrast', 'implement', 'debug',
  'refactor', 'migrate', 'integrate', 'benchmark',
]);

const MODERATE_VERBS = new Set([
  'explain', 'describe', 'summarize', 'write', 'create',
  'generate', 'build', 'convert', 'transform', 'translate',
]);

// ── Shannon entropy calculation ──────────────────────────────────

function shannonEntropy(text: string): number {
  const freq = new Map<string, number>();
  const lower = text.toLowerCase();
  for (const char of lower) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }

  const len = lower.length;
  if (len === 0) return 0;

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ── Clause depth estimation ──────────────────────────────────────

function estimateClauseDepth(text: string): number {
  // Count subordinating conjunctions and nesting indicators
  const subordinators = /\b(because|although|while|whereas|if|unless|since|when|where|that|which|who|whom|whose|after|before|until)\b/gi;
  const matches = text.match(subordinators);
  const conjunctionCount = matches?.length ?? 0;

  // Count nesting punctuation
  const parens = (text.match(/[()]/g)?.length ?? 0) / 2;
  const commas = text.match(/,/g)?.length ?? 0;
  const semicolons = text.match(/;/g)?.length ?? 0;

  return conjunctionCount + parens + Math.floor(commas / 2) + semicolons;
}

// ── Cognitive verb counting ──────────────────────────────────────

function countCognitiveVerbs(text: string): { count: number; maxTier: TaskComplexity } {
  const words = text.toLowerCase().split(/\s+/);
  let count = 0;
  let maxTier: TaskComplexity = 'trivial';

  for (const word of words) {
    const stem = word.replace(/(?:ing|ed|s|es|tion|ment)$/, '');

    if (EXPERT_VERBS.has(word) || EXPERT_VERBS.has(stem)) {
      count++;
      maxTier = 'expert';
    } else if (COMPLEX_VERBS.has(word) || COMPLEX_VERBS.has(stem)) {
      count++;
      if (maxTier !== 'expert') maxTier = 'complex';
    } else if (MODERATE_VERBS.has(word) || MODERATE_VERBS.has(stem)) {
      count++;
      if (maxTier !== 'expert' && maxTier !== 'complex') maxTier = 'moderate';
    }
  }

  return { count, maxTier };
}

// ── Code detection ───────────────────────────────────────────────

function detectCode(text: string): boolean {
  // Code fences
  if (/```/.test(text)) return true;
  // Common code patterns
  if (/(?:function|const|let|var|import|export|class|def |return |=>|->|\{|\}|;$)/m.test(text)) return true;
  // File paths
  if (/\.[jt]sx?|\.py|\.rs|\.go|\.java|\.cpp|\.c$/m.test(text)) return true;
  return false;
}

// ── Main classifier ──────────────────────────────────────────────

export function classifyTask(messages: ChatMessage[]): ClassificationResult {
  // Use the last user message for classification
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    return {
      complexity: 'simple',
      signals: { entropy: 0, cognitiveVerbs: 0, clauseDepth: 0, codeDetected: false, avgWordLength: 0, tokenEstimate: 0 },
      confidence: 1.0,
    };
  }

  const text = lastUserMsg.content;
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Compute signals
  const entropy = shannonEntropy(text);
  const { count: cognitiveVerbs, maxTier: verbTier } = countCognitiveVerbs(text);
  const clauseDepth = estimateClauseDepth(text);
  const codeDetected = detectCode(text);
  const avgWordLength = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 0;
  const tokenEstimate = Math.ceil(text.length / 4);

  const signals: ClassificationSignals = {
    entropy,
    cognitiveVerbs,
    clauseDepth,
    codeDetected,
    avgWordLength,
    tokenEstimate,
  };

  // ── Scoring ────────────────────────────────────────────────────

  let score = 0;

  // Token length contribution (longer = more complex)
  if (tokenEstimate < 5) score += 0;
  else if (tokenEstimate < 20) score += 1;
  else if (tokenEstimate < 50) score += 2;
  else if (tokenEstimate < 150) score += 3;
  else score += 4;

  // Entropy contribution (higher entropy = more complex vocabulary)
  if (entropy > 4.5) score += 2;
  else if (entropy > 4.0) score += 1;

  // Cognitive verb contribution
  score += Math.min(cognitiveVerbs * 1.5, 4);

  // Clause depth contribution
  if (clauseDepth > 4) score += 2;
  else if (clauseDepth > 2) score += 1;

  // Code detection bonus
  if (codeDetected) score += 1;

  // Average word length (technical vocabulary tends to be longer)
  if (avgWordLength > 6) score += 1;

  // ── Map score to complexity ────────────────────────────────────

  let complexity: TaskComplexity;
  if (score <= 1) complexity = 'trivial';
  else if (score <= 3) complexity = 'simple';
  else if (score <= 6) complexity = 'moderate';
  else if (score <= 9) complexity = 'complex';
  else complexity = 'expert';

  // Verb tier can only push UP, never down
  const tierRank: Record<TaskComplexity, number> = {
    trivial: 0, simple: 1, moderate: 2, complex: 3, expert: 4,
  };
  if (tierRank[verbTier] > tierRank[complexity]) {
    complexity = verbTier;
  }

  // Confidence: higher when signals agree, lower when mixed
  const signalCount = [
    tokenEstimate > 100 ? 1 : 0,
    entropy > 4.0 ? 1 : 0,
    cognitiveVerbs > 0 ? 1 : 0,
    clauseDepth > 2 ? 1 : 0,
    codeDetected ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // More signals pointing the same direction = higher confidence
  const confidence = signalCount >= 3 ? 0.9 : signalCount >= 2 ? 0.7 : 0.5;

  return { complexity, signals, confidence };
}
