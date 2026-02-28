import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  generateIssuerKeys,
  createIssuer,
  issueToken,
  verifyToken,
  redeemToken,
  _resetSpentTokens,
  publicVerif,
  BlindRSAMode,
} from '../issuer';
import {
  popToken,
  getTokenCount,
  needsRefresh,
  initTokenManager,
  _resetTokenManager,
} from '../tokens';
import type { TokenConfig } from '../types';

const { Client, Origin } = publicVerif;

// ── Issuer Tests ────────────────────────────────────────────────

describe('issuer', () => {
  beforeEach(() => {
    _resetSpentTokens();
  });

  it('generates a valid keypair', async () => {
    const keys = await generateIssuerKeys();
    expect(keys.privateKeyJwk).toBeDefined();
    expect(keys.publicKeyJwk).toBeDefined();
    expect(keys.privateKeyJwk.kty).toBe('RSA');
    expect(keys.publicKeyJwk.kty).toBe('RSA');
    expect(keys.createdAt).toBeTruthy();
  });

  it('creates an issuer instance from keys', async () => {
    const keys = await generateIssuerKeys();
    const instance = await createIssuer(keys);
    expect(instance.issuer).toBeDefined();
    expect(instance.origin).toBeDefined();
    expect(instance.publicKeyBytes).toBeInstanceOf(Uint8Array);
    expect(instance.publicKeyBytes.length).toBeGreaterThan(0);
  });

  it('performs full blind signature round-trip', async () => {
    const keys = await generateIssuerKeys();
    const instance = await createIssuer(keys);

    // Client side: create a token request (blinded)
    const client = new Client(BlindRSAMode.PSS);
    const origin = new Origin(BlindRSAMode.PSS, ['inference.local']);

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      keys.publicKeyJwk,
      { name: 'RSA-PSS', hash: 'SHA-384' },
      true,
      ['verify'],
    );
    const pkBytes = await publicVerif.getPublicKeyBytes(publicKey);

    const ctx = crypto.getRandomValues(new Uint8Array(32));
    const challenge = origin.createTokenChallenge('engram-privacy.local', ctx);
    const tokenRequest = await client.createTokenRequest(challenge, pkBytes);

    // Issuer side: blind-sign the request
    const blindSigBytes = await issueToken(instance, tokenRequest.serialize());
    expect(blindSigBytes).toBeInstanceOf(Uint8Array);
    expect(blindSigBytes.length).toBeGreaterThan(0);

    // Client side: finalize (unblind) the token
    const tokenResponse = publicVerif.TokenResponse.deserialize(blindSigBytes);
    const token = await client.finalize(tokenResponse);
    expect(token).toBeDefined();

    // Verify the token
    const isValid = await verifyToken(instance, token.serialize());
    expect(isValid).toBe(true);
  });

  it('rejects invalid token bytes', async () => {
    const keys = await generateIssuerKeys();
    const instance = await createIssuer(keys);

    const garbage = new Uint8Array(64);
    crypto.getRandomValues(garbage);
    const isValid = await verifyToken(instance, garbage);
    expect(isValid).toBe(false);
  });

  it('prevents double-spend', async () => {
    const tokenBytes = new Uint8Array(64);
    crypto.getRandomValues(tokenBytes);

    expect(redeemToken(tokenBytes)).toBe(true);
    expect(redeemToken(tokenBytes)).toBe(false);
  });

  it('allows different tokens to redeem', async () => {
    const token1 = new Uint8Array(64);
    const token2 = new Uint8Array(64);
    crypto.getRandomValues(token1);
    crypto.getRandomValues(token2);

    expect(redeemToken(token1)).toBe(true);
    expect(redeemToken(token2)).toBe(true);
  });
});

// ── Token Manager Tests ─────────────────────────────────────────

describe('token manager', () => {
  beforeEach(() => {
    _resetTokenManager();
  });

  afterEach(() => {
    _resetTokenManager();
  });

  const defaultConfig: TokenConfig = {
    enabled: true,
    issuer: 'vouch',
    batchSize: 50,
    refreshThreshold: 10,
  };

  it('starts with zero tokens', () => {
    expect(getTokenCount()).toBe(0);
  });

  it('popToken returns null when empty', () => {
    expect(popToken()).toBeNull();
  });

  it('needsRefresh returns true when below threshold', () => {
    expect(needsRefresh(defaultConfig)).toBe(true);
  });

  it('needsRefresh with zero threshold returns false on empty cache', () => {
    expect(needsRefresh({ ...defaultConfig, refreshThreshold: 0 })).toBe(false);
  });
});

// ── Integration: Issuer → Client → Token Cache ─────────────────

describe('issuer + client integration', () => {
  beforeEach(() => {
    _resetTokenManager();
    _resetSpentTokens();
  });

  it('issues multiple tokens that are all independently valid', async () => {
    const keys = await generateIssuerKeys();
    const instance = await createIssuer(keys);

    const client = new Client(BlindRSAMode.PSS);
    const origin = new Origin(BlindRSAMode.PSS, ['inference.local']);

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      keys.publicKeyJwk,
      { name: 'RSA-PSS', hash: 'SHA-384' },
      true,
      ['verify'],
    );
    const pkBytes = await publicVerif.getPublicKeyBytes(publicKey);

    const tokens: Uint8Array[] = [];

    // Issue 3 tokens
    for (let i = 0; i < 3; i++) {
      const ctx = crypto.getRandomValues(new Uint8Array(32));
      const challenge = origin.createTokenChallenge('engram-privacy.local', ctx);
      const tokenRequest = await client.createTokenRequest(challenge, pkBytes);

      const blindSigBytes = await issueToken(instance, tokenRequest.serialize());
      const tokenResponse = publicVerif.TokenResponse.deserialize(blindSigBytes);
      const token = await client.finalize(tokenResponse);
      tokens.push(token.serialize());
    }

    // All should be valid
    for (const tokenBytes of tokens) {
      expect(await verifyToken(instance, tokenBytes)).toBe(true);
    }

    // All should be redeemable (no double-spend)
    for (const tokenBytes of tokens) {
      expect(redeemToken(tokenBytes)).toBe(true);
    }

    // None should be re-redeemable
    for (const tokenBytes of tokens) {
      expect(redeemToken(tokenBytes)).toBe(false);
    }
  });

  it('tokens from one issuer are not valid with different keys', async () => {
    const keys1 = await generateIssuerKeys();
    const keys2 = await generateIssuerKeys();
    const instance1 = await createIssuer(keys1);
    const instance2 = await createIssuer(keys2);

    // Issue token with issuer 1
    const client = new Client(BlindRSAMode.PSS);
    const origin = new Origin(BlindRSAMode.PSS, ['inference.local']);

    const publicKey1 = await crypto.subtle.importKey(
      'jwk',
      keys1.publicKeyJwk,
      { name: 'RSA-PSS', hash: 'SHA-384' },
      true,
      ['verify'],
    );
    const pkBytes1 = await publicVerif.getPublicKeyBytes(publicKey1);

    const ctx = crypto.getRandomValues(new Uint8Array(32));
    const challenge = origin.createTokenChallenge('engram-privacy.local', ctx);
    const tokenRequest = await client.createTokenRequest(challenge, pkBytes1);
    const blindSigBytes = await issueToken(instance1, tokenRequest.serialize());
    const tokenResponse = publicVerif.TokenResponse.deserialize(blindSigBytes);
    const token = await client.finalize(tokenResponse);

    // Valid with issuer 1
    expect(await verifyToken(instance1, token.serialize())).toBe(true);

    // Invalid with issuer 2 (different keys)
    expect(await verifyToken(instance2, token.serialize())).toBe(false);
  });
});
