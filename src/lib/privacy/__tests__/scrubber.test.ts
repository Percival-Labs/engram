import { describe, it, expect } from 'bun:test';
import { scrub, restore, getRulesForLevel, compileUserRules } from '../scrubber';
import type { ChatMessage } from '../../providers/types';

function msgs(...contents: string[]): ChatMessage[] {
  return contents.map(c => ({ role: 'user' as const, content: c }));
}

describe('scrubber', () => {
  describe('getRulesForLevel', () => {
    it('minimal includes API key rules', () => {
      const rules = getRulesForLevel('minimal');
      const names = rules.map(r => r.name);
      expect(names).toContain('api-key-openai');
      expect(names).toContain('api-key-anthropic');
      expect(names).toContain('ssn');
      expect(names).not.toContain('email');
    });

    it('standard includes email and phone', () => {
      const rules = getRulesForLevel('standard');
      const names = rules.map(r => r.name);
      expect(names).toContain('email');
      expect(names).toContain('phone-us');
      expect(names).toContain('ip-address');
      expect(names).toContain('home-path');
    });

    it('aggressive includes nsec and private keys', () => {
      const rules = getRulesForLevel('aggressive');
      const names = rules.map(r => r.name);
      expect(names).toContain('nsec');
      expect(names).toContain('private-key-block');
      expect(names).toContain('bearer-token');
    });
  });

  describe('scrub — API keys', () => {
    const rules = getRulesForLevel('minimal');

    it('redacts OpenAI API keys', () => {
      const result = scrub(msgs('my key is sk-abc123def456ghi789jklmnopqrstuvwxyz'), rules);
      expect(result.messages[0].content).not.toContain('sk-abc123');
      expect(result.messages[0].content).toContain('[REDACTED_API_KEY]');
      expect(result.stats.totalRedactions).toBe(1);
    });

    it('redacts Anthropic API keys', () => {
      const result = scrub(msgs('key: sk-ant-abc123def456ghi789jklmnop'), rules);
      expect(result.messages[0].content).not.toContain('sk-ant-');
      expect(result.stats.totalRedactions).toBeGreaterThanOrEqual(1);
    });

    it('redacts AWS access keys', () => {
      const result = scrub(msgs('aws key AKIAIOSFODNN7EXAMPLE'), rules);
      expect(result.messages[0].content).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.messages[0].content).toContain('[REDACTED_AWS_KEY]');
    });

    it('redacts GitHub tokens', () => {
      const result = scrub(msgs('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'), rules);
      expect(result.messages[0].content).not.toContain('ghp_');
      expect(result.messages[0].content).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('redacts generic key=value secrets', () => {
      const result = scrub(msgs('api_key=mySuper_Secret_Value_1234567890'), rules);
      expect(result.messages[0].content).toContain('[REDACTED_SECRET]');
    });
  });

  describe('scrub — PII', () => {
    const rules = getRulesForLevel('standard');

    it('redacts email addresses', () => {
      const result = scrub(msgs('contact me at alan@example.com please'), rules);
      expect(result.messages[0].content).not.toContain('alan@example.com');
      expect(result.messages[0].content).toContain('[REDACTED_EMAIL]');
    });

    it('redacts phone numbers', () => {
      const result = scrub(msgs('call me at (555) 123-4567'), rules);
      expect(result.messages[0].content).not.toContain('555');
      expect(result.messages[0].content).toContain('[REDACTED_PHONE]');
    });

    it('redacts IP addresses', () => {
      const result = scrub(msgs('server at 192.168.1.100'), rules);
      expect(result.messages[0].content).not.toContain('192.168.1.100');
      expect(result.messages[0].content).toContain('[REDACTED_IP]');
    });

    it('redacts home directory paths', () => {
      const result = scrub(msgs('file at /Users/alancarroll/Documents/secret.txt'), rules);
      expect(result.messages[0].content).not.toContain('alancarroll');
      expect(result.messages[0].content).toContain('[REDACTED_USER]');
    });

    it('redacts SSN', () => {
      const result = scrub(msgs('ssn is 123-45-6789'), rules);
      expect(result.messages[0].content).not.toContain('123-45-6789');
      expect(result.messages[0].content).toContain('[REDACTED_SSN]');
    });

    it('redacts credit card numbers', () => {
      const result = scrub(msgs('card: 4111-1111-1111-1111'), rules);
      expect(result.messages[0].content).not.toContain('4111');
      expect(result.messages[0].content).toContain('[REDACTED_CARD]');
    });
  });

  describe('scrub — aggressive', () => {
    const rules = getRulesForLevel('aggressive');

    it('redacts Nostr nsec keys', () => {
      const result = scrub(
        msgs('nsec1jvz9jdxgw9mh82y83844ug5gxq2rptup2xd9zrntjuas07l3w2ms865n9w'),
        rules,
      );
      expect(result.messages[0].content).not.toContain('nsec1');
      expect(result.messages[0].content).toContain('[REDACTED_NSEC]');
    });

    it('redacts Bearer tokens', () => {
      const result = scrub(msgs('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'), rules);
      expect(result.messages[0].content).toContain('[REDACTED_TOKEN]');
    });

    it('redacts PEM private keys', () => {
      const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCA...\n-----END RSA PRIVATE KEY-----';
      const result = scrub(msgs(`here is my key:\n${key}`), rules);
      expect(result.messages[0].content).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(result.messages[0].content).toContain('[REDACTED_PRIVATE_KEY]');
    });
  });

  describe('scrub — user-defined rules', () => {
    it('applies custom patterns', () => {
      const custom = compileUserRules([
        { name: 'project', pattern: 'PercivalLabs|Percival Labs', replacement: '[PROJECT]' },
        { name: 'location', pattern: 'Bellingham', replacement: '[LOCATION]' },
      ]);
      const rules = [...getRulesForLevel('standard'), ...custom];
      const result = scrub(msgs('Working on Percival Labs from Bellingham'), rules);
      expect(result.messages[0].content).toBe('Working on [PROJECT] from [LOCATION]');
      expect(result.stats.byRule['project']).toBe(1);
      expect(result.stats.byRule['location']).toBe(1);
    });
  });

  describe('scrub — edge cases', () => {
    it('handles messages with no PII', () => {
      const rules = getRulesForLevel('standard');
      const result = scrub(msgs('What is the capital of France?'), rules);
      expect(result.messages[0].content).toBe('What is the capital of France?');
      expect(result.stats.totalRedactions).toBe(0);
    });

    it('handles empty messages', () => {
      const rules = getRulesForLevel('standard');
      const result = scrub(msgs(''), rules);
      expect(result.messages[0].content).toBe('');
    });

    it('handles multiple messages', () => {
      const rules = getRulesForLevel('standard');
      const result = scrub(
        [
          { role: 'system' as const, content: 'You are helpful.' },
          { role: 'user' as const, content: 'My email is test@test.com' },
          { role: 'assistant' as const, content: 'I see your email.' },
          { role: 'user' as const, content: 'IP is 10.0.0.1' },
        ],
        rules,
      );
      expect(result.messages[0].content).toBe('You are helpful.');
      expect(result.messages[1].content).toContain('[REDACTED_EMAIL]');
      expect(result.messages[2].content).toBe('I see your email.');
      expect(result.messages[3].content).toContain('[REDACTED_IP]');
      expect(result.stats.totalRedactions).toBe(2);
    });

    it('preserves message roles', () => {
      const rules = getRulesForLevel('standard');
      const input: ChatMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
        { role: 'assistant', content: 'ast' },
      ];
      const result = scrub(input, rules);
      expect(result.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant']);
    });
  });

  describe('restore', () => {
    it('is a no-op when no redactions', () => {
      const map = new Map<string, string>();
      expect(restore('hello world', map)).toBe('hello world');
    });

    it('does not restore replacement labels (only exact placeholder IDs)', () => {
      // The LLM might echo back "[REDACTED_EMAIL]" but we only restore
      // exact __REDACTED_N__ placeholders that were in the outbound messages.
      const map = new Map([['__REDACTED_0__', 'alan@test.com']]);
      const response = 'The email you mentioned was [REDACTED_EMAIL]';
      expect(restore(response, map)).toBe(response); // unchanged
    });
  });

  describe('compileUserRules', () => {
    it('compiles string patterns to RegExp', () => {
      const rules = compileUserRules([
        { name: 'test', pattern: 'foo|bar', replacement: '[X]' },
      ]);
      expect(rules).toHaveLength(1);
      expect(rules[0].pattern).toBeInstanceOf(RegExp);
      expect(rules[0].pattern.flags).toContain('g');
      expect(rules[0].pattern.flags).toContain('i');
    });
  });
});
