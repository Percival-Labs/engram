import { describe, test, expect } from 'bun:test';
import { classifyTask } from '../classifier';
import type { ChatMessage } from '../../providers/types';

// Helper to classify a single user message
function classify(input: string) {
  const messages: ChatMessage[] = [{ role: 'user', content: input }];
  return classifyTask(messages);
}

// ─── Tier Classification ────────────────────────────────────────

describe('classifyTask — tier classification', () => {
  describe('trivial', () => {
    const trivialInputs = [
      'hi',
      'hello',
      'yes',
      'no',
      'thanks',
      'ok',
      'bye',
    ];

    for (const input of trivialInputs) {
      test(`"${input}" → trivial`, () => {
        expect(classify(input).complexity).toBe('trivial');
      });
    }
  });

  describe('simple (short factual questions)', () => {
    // These are 8+ word questions that should score at least simple
    const simpleInputs = [
      'List 5 JavaScript frameworks and what they are each used for',
      'Explain what the spread operator does in JavaScript, show me a few common use cases, and describe when I should prefer it over Object.assign',
      'How do I create a new branch in git and push it to the remote repository?',
      'What is the difference between let and const in JavaScript and when should I use each?',
    ];

    for (const input of simpleInputs) {
      test(`"${input.slice(0, 50)}..." → simple or above`, () => {
        const result = classify(input);
        expect(['simple', 'moderate', 'complex', 'expert']).toContain(result.complexity);
      });
    }
  });

  describe('moderate (creation, explanation, conversion tasks)', () => {
    const moderateInputs = [
      'Write a function that checks if a string is a palindrome',
      'Create a React component that displays a sortable table',
      'Explain the difference between TCP and UDP, including when to use each protocol',
      'Generate a TypeScript interface from this JSON schema',
      'Summarize the key differences between REST and GraphQL APIs in a comparison table',
    ];

    for (const input of moderateInputs) {
      test(`"${input.slice(0, 50)}..." → moderate or above`, () => {
        const result = classify(input);
        expect(['moderate', 'complex', 'expert']).toContain(result.complexity);
      });
    }
  });

  describe('complex (multi-faceted analysis, debugging)', () => {
    const complexInputs = [
      'Analyze the trade-offs between using a monorepo vs polyrepo architecture for a team of 15 engineers, considering CI/CD pipeline complexity, dependency management, and code ownership boundaries',
      'Debug this authentication flow: users are getting 401 errors after token refresh, but only when the refresh happens within 5 seconds of the previous request. The middleware uses JWT with rotating refresh tokens.',
      'Compare event sourcing vs CRUD for a financial application that needs audit trails, considering consistency guarantees, storage costs, and query patterns across multiple services',
      'Implement a distributed rate limiter that works across multiple Node.js instances behind a load balancer, supporting sliding window counters with Redis, including graceful degradation when Redis is unavailable',
    ];

    for (const input of complexInputs) {
      test(`"${input.slice(0, 50)}..." → complex or expert`, () => {
        const result = classify(input);
        expect(['complex', 'expert']).toContain(result.complexity);
      });
    }
  });

  describe('expert (architecture design, formal proofs, system design)', () => {
    const expertInputs = [
      'Design a distributed consensus protocol for a mesh network of autonomous AI agents that must achieve Byzantine fault tolerance while maintaining sub-second latency. Consider the CAP theorem implications and prove the safety guarantees formally.',
      'Architect a real-time event sourcing system with CQRS that handles 100K events/second, supports temporal queries, and provides exactly-once delivery semantics across multiple availability zones. Include the formal verification approach for the state machine.',
    ];

    for (const input of expertInputs) {
      test(`"${input.slice(0, 50)}..." → expert`, () => {
        const result = classify(input);
        expect(result.complexity).toBe('expert');
      });
    }
  });
});

// ─── Signal Detection ───────────────────────────────────────────

describe('classifyTask — signal detection', () => {
  test('detects code in message with code fences', () => {
    const result = classify('Fix this code:\n```js\nconst x = 1;\n```');
    expect(result.signals.codeDetected).toBe(true);
  });

  test('detects code patterns without fences', () => {
    const result = classify('The function returns undefined because of the missing return statement');
    expect(result.signals.codeDetected).toBe(true);
  });

  test('no code detection in plain text', () => {
    const result = classify('What is the weather like today?');
    expect(result.signals.codeDetected).toBe(false);
  });

  test('counts cognitive verbs', () => {
    const result = classify('Analyze and compare these two approaches, then design a solution');
    expect(result.signals.cognitiveVerbs).toBeGreaterThanOrEqual(3);
  });

  test('zero cognitive verbs in simple greeting', () => {
    const result = classify('hello there');
    expect(result.signals.cognitiveVerbs).toBe(0);
  });

  test('clause depth increases with subordinating conjunctions', () => {
    const simple = classify('Do this.');
    const complex = classify('Do this because the system needs it, although the alternative would work if we had more time, unless the deadline changes.');
    expect(complex.signals.clauseDepth).toBeGreaterThan(simple.signals.clauseDepth);
  });

  test('entropy increases with vocabulary diversity', () => {
    const low = classify('the the the the the');
    const high = classify('Byzantine fault tolerance distributed consensus protocol');
    expect(high.signals.entropy).toBeGreaterThan(low.signals.entropy);
  });

  test('token estimate is roughly chars / 4', () => {
    const input = 'This is a test sentence with some words in it';
    const result = classify(input);
    expect(result.signals.tokenEstimate).toBe(Math.ceil(input.length / 4));
  });

  test('average word length is calculated correctly', () => {
    const result = classify('hi ok');  // avg = (2+2)/2 = 2
    expect(result.signals.avgWordLength).toBe(2);
  });
});

// ─── Confidence ─────────────────────────────────────────────────

describe('classifyTask — confidence', () => {
  test('high confidence when multiple signals agree', () => {
    const result = classify(
      'Design and architect a distributed system that implements Byzantine fault tolerance across multiple availability zones, considering the CAP theorem trade-offs'
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('lower confidence for ambiguous short inputs', () => {
    const result = classify('maybe do the thing');
    expect(result.confidence).toBeLessThanOrEqual(0.7);
  });
});

// ─── Verb Tier Promotion ────────────────────────────────────────

describe('classifyTask — verb tier promotion', () => {
  test('expert verb promotes complexity upward', () => {
    // Short message but with "design" (expert verb)
    const result = classify('Design this API');
    expect(['moderate', 'complex', 'expert']).toContain(result.complexity);
  });

  test('complex verb promotes complexity upward', () => {
    const result = classify('Analyze this data');
    expect(['moderate', 'complex', 'expert']).toContain(result.complexity);
  });

  test('verb tier never pushes complexity down', () => {
    // Long complex message — moderate verb "write" shouldn't reduce it
    const result = classify(
      'Write a comprehensive implementation of a distributed hash table with consistent hashing, virtual nodes, and automatic rebalancing when nodes join or leave the cluster, including detailed error handling for network partitions'
    );
    expect(['complex', 'expert']).toContain(result.complexity);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe('classifyTask — edge cases', () => {
  test('empty messages array returns simple with full confidence', () => {
    const result = classifyTask([]);
    expect(result.complexity).toBe('simple');
    expect(result.confidence).toBe(1.0);
  });

  test('only system message (no user message) returns simple', () => {
    const result = classifyTask([{ role: 'system', content: 'You are a helpful assistant' }]);
    expect(result.complexity).toBe('simple');
  });

  test('uses last user message when multiple exist', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Design a distributed consensus protocol for Byzantine fault tolerance with formal safety proofs' },
    ];
    const result = classifyTask(messages);
    expect(['complex', 'expert']).toContain(result.complexity);
  });

  test('very long input gets high complexity', () => {
    const longInput = 'Please help me understand ' + 'the implications of this decision '.repeat(50);
    const result = classify(longInput);
    expect(['moderate', 'complex', 'expert']).toContain(result.complexity);
  });

  test('single character input is trivial', () => {
    expect(classify('?').complexity).toBe('trivial');
  });

  test('emoji-only input is trivial', () => {
    expect(classify('👍').complexity).toBe('trivial');
  });
});
