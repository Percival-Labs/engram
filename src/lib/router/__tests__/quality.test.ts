import { describe, test, expect } from 'bun:test';
import { validateResponse } from '../quality';
import type { TaskComplexity } from '../types';

// ─── Length Checks ──────────────────────────────────────────────

describe('validateResponse — length checks', () => {
  test('passes when response meets minimum length for trivial', () => {
    const result = validateResponse('hi', 'Hello!', 'trivial');
    expect(result.pass).toBe(true);
  });

  test('fails when response is too short for moderate complexity', () => {
    const result = validateResponse(
      'Explain the difference between TCP and UDP',
      'TCP is reliable.',
      'moderate',
    );
    expect(result.reasons).toContainEqual(expect.stringContaining('too short'));
  });

  test('fails when response is too short for complex complexity', () => {
    const result = validateResponse(
      'Analyze the trade-offs between monorepo and polyrepo',
      'Monorepo is simpler.',
      'complex',
    );
    expect(result.reasons).toContainEqual(expect.stringContaining('too short'));
  });

  test('passes when response is long enough for expert', () => {
    const longResponse = 'The distributed consensus protocol must account for Byzantine failures where nodes may exhibit arbitrary behavior. ' +
      'We can formalize the safety property as follows: for any two honest nodes that decide, they decide on the same value. ' +
      'The liveness property ensures that all honest nodes eventually decide. This requires at least 3f+1 nodes to tolerate f Byzantine faults.';
    const result = validateResponse(
      'Design a Byzantine fault tolerant consensus protocol',
      longResponse,
      'expert',
    );
    const lengthReasons = result.reasons.filter(r => r.includes('too short'));
    expect(lengthReasons).toHaveLength(0);
  });
});

// ─── Refusal Detection ──────────────────────────────────────────

describe('validateResponse — refusal detection', () => {
  const refusals = [
    "I can't help with that request.",
    "I cannot provide that information.",
    "I'm not able to generate code for that.",
    "As an AI language model, I don't have the ability to do that.",
    "Sorry, I can't assist with that.",
    "Unfortunately, I cannot fulfill that request.",
    "I'm just an AI, I can't do that.",
  ];

  for (const refusal of refusals) {
    test(`detects refusal: "${refusal.slice(0, 40)}..."`, () => {
      const result = validateResponse('Write a function', refusal, 'moderate');
      expect(result.reasons).toContainEqual(expect.stringContaining('refusal'));
    });
  }

  test('does not flag normal responses as refusals', () => {
    const result = validateResponse(
      'Write a function',
      'Here is a function that does what you asked:\n```js\nfunction hello() { return "hi"; }\n```',
      'moderate',
    );
    const refusalReasons = result.reasons.filter(r => r.includes('refusal'));
    expect(refusalReasons).toHaveLength(0);
  });

  test('does not flag responses that mention "I can" (not "I can\'t")', () => {
    const result = validateResponse(
      'Can you help?',
      'I can definitely help you with that! Here is what you need to know about TypeScript interfaces and their usage in modern development.',
      'simple',
    );
    const refusalReasons = result.reasons.filter(r => r.includes('refusal'));
    expect(refusalReasons).toHaveLength(0);
  });
});

// ─── Code Format Compliance ─────────────────────────────────────

describe('validateResponse — code format compliance', () => {
  test('passes when code block is present for code request', () => {
    const result = validateResponse(
      'Write a function that adds two numbers',
      'Here you go:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```',
      'moderate',
    );
    const codeReasons = result.reasons.filter(r => r.includes('code'));
    expect(codeReasons).toHaveLength(0);
  });

  test('fails when code block is missing for code request', () => {
    const result = validateResponse(
      'Write a function that adds two numbers',
      'You can create a function called add that takes two parameters and returns their sum using the plus operator.',
      'moderate',
    );
    expect(result.reasons).toContainEqual(expect.stringContaining('code'));
  });

  test('skips code check for non-code requests', () => {
    const result = validateResponse(
      'What is the capital of France?',
      'The capital of France is Paris.',
      'trivial',
    );
    const codeReasons = result.reasons.filter(r => r.includes('code'));
    expect(codeReasons).toHaveLength(0);
  });

  test('code request keywords: write, create, generate, implement + code noun', () => {
    const queries = [
      'Write a function that sorts an array',
      'Create a class for managing users',
      'Generate a script to parse CSV files',
      'Implement a method that validates email addresses',
    ];
    for (const query of queries) {
      const result = validateResponse(
        query,
        'You should use a comparison-based approach that divides the array recursively and merges the results back together in sorted order.',
        'moderate',
      );
      expect(result.reasons).toContainEqual(expect.stringContaining('code'));
    }
  });

  test('skips code check for trivial complexity even with code keyword', () => {
    const result = validateResponse(
      'Write yes or no',
      'Yes.',
      'trivial',
    );
    const codeReasons = result.reasons.filter(r => r.includes('code'));
    expect(codeReasons).toHaveLength(0);
  });
});

// ─── Query-Response Coherence ───────────────────────────────────

describe('validateResponse — coherence', () => {
  test('high coherence when response uses query keywords', () => {
    const result = validateResponse(
      'How does garbage collection work in JavaScript?',
      'Garbage collection in JavaScript is an automatic memory management feature. The JavaScript engine tracks object references and periodically frees memory that is no longer reachable from the root.',
      'moderate',
    );
    expect(result.score).toBeGreaterThan(0.7);
  });

  test('low coherence when response is completely off-topic', () => {
    const result = validateResponse(
      'How does garbage collection work in JavaScript?',
      'The recipe calls for two cups of flour, one egg, and a pinch of salt. Mix well and bake at 350 degrees.',
      'moderate',
    );
    expect(result.reasons).toContainEqual(expect.stringContaining('coherence'));
  });

  test('coherence check is lenient for trivial complexity', () => {
    // Even off-topic response should not flag coherence for trivial
    const result = validateResponse(
      'hi',
      'Hello there! How can I help you today?',
      'trivial',
    );
    const coherenceReasons = result.reasons.filter(r => r.includes('coherence'));
    expect(coherenceReasons).toHaveLength(0);
  });
});

// ─── Empty Response ─────────────────────────────────────────────

describe('validateResponse — empty responses', () => {
  test('empty string fails', () => {
    const result = validateResponse('Tell me about TypeScript', '', 'simple');
    expect(result.pass).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining('Empty'));
  });

  test('whitespace-only fails', () => {
    const result = validateResponse('Tell me about TypeScript', '   \n\t  ', 'simple');
    expect(result.pass).toBe(false);
  });
});

// ─── Score Calculation ──────────────────────────────────────────

describe('validateResponse — scoring', () => {
  test('perfect response scores high', () => {
    const result = validateResponse(
      'Write a TypeScript function that reverses a string',
      'Here is a TypeScript function that reverses a string:\n\n```typescript\nfunction reverseString(str: string): string {\n  return str.split("").reverse().join("");\n}\n```\n\nThis works by splitting the string into characters, reversing the array, and joining back.',
      'moderate',
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  test('refusal scores very low', () => {
    const result = validateResponse(
      'Write a function',
      "I can't help with that.",
      'moderate',
    );
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });

  test('score is between 0 and 1', () => {
    const inputs: Array<[string, string, TaskComplexity]> = [
      ['hi', 'Hello!', 'trivial'],
      ['Write code', "I can't do that.", 'moderate'],
      ['Explain X', '', 'simple'],
      ['Analyze Y', 'Y is interesting because of its unique properties in the context of distributed systems. The key trade-off is between consistency and availability.', 'complex'],
    ];

    for (const [query, response, complexity] of inputs) {
      const result = validateResponse(query, response, complexity);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Pass/Fail Threshold ────────────────────────────────────────

describe('validateResponse — pass/fail', () => {
  test('passes with no reasons and score >= 0.7', () => {
    const result = validateResponse(
      'What is TypeScript?',
      'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. It adds static type checking to JavaScript.',
      'simple',
    );
    expect(result.pass).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  test('fails when any reason is present', () => {
    const result = validateResponse(
      'Write a sorting algorithm',
      'Sort is easy.',  // too short + no code block
      'moderate',
    );
    expect(result.pass).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
