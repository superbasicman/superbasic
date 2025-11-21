import { describe, expect, it } from 'vitest';
import {
  deriveCodeChallenge,
  generateCodeVerifier,
  isValidCodeVerifier,
  normalizePkceMethod,
  validatePkcePair,
  validatePkceRequest,
} from '../pkce.js';

describe('pkce helpers', () => {
  it('generates a valid code verifier of default length', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(isValidCodeVerifier(verifier)).toBe(true);
  });

  it('throws for an invalid verifier length', () => {
    expect(() => generateCodeVerifier(10)).toThrowError();
  });

  it('derives the RFC 7636 sample challenge for S256', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = deriveCodeChallenge(verifier, 'S256');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('supports plain method', () => {
    const verifier = 'simple-verifier-string-with-valid-length-1234567890ABCDE';
    const challenge = deriveCodeChallenge(verifier, 'plain');
    expect(challenge).toBe(verifier);
  });

  it('validates a matching PKCE pair', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const result = validatePkcePair({
      codeVerifier: verifier,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });
    expect(result).toEqual({ codeChallenge: challenge, codeChallengeMethod: 'S256' });
  });

  it('rejects mismatched verifier and challenge', () => {
    expect(() =>
      validatePkcePair({
        codeVerifier: 'this-verifier-does-not-match-the-challenge-because-it-is-different-abc',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
      })
    ).toThrowError();
  });

  it('normalizes PKCE method casing', () => {
    expect(normalizePkceMethod('s256')).toBe('S256');
    expect(normalizePkceMethod('PLAIN')).toBe('plain');
    expect(() => normalizePkceMethod('md5')).toThrowError();
  });

  it('validates required fields in a PKCE request', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(() =>
      validatePkceRequest({
        codeVerifier: verifier,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      })
    ).not.toThrow();
  });
});
