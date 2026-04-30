import { describe, expect, it } from 'vitest';
import {
  classifyCredential,
  isOidcJwtLike,
  isVercelTokenLike,
} from '../../../../src/util/auth/credential';

describe('credential classification', () => {
  it('detects Vercel tokens', () => {
    expect(isVercelTokenLike('vcp_abc.def')).toBe(true);
    expect(isVercelTokenLike('vca_abc.def')).toBe(true);
    expect(classifyCredential('vct_abc.def')).toBe('vercel-token');
  });

  it('does not treat arbitrary 24-character strings as Vercel tokens', () => {
    expect(isVercelTokenLike('abcdefghijklmnopqrstuvwx')).toBe(false);
    expect(classifyCredential('abcdefghijklmnopqrstuvwx')).toBe('invalid');
  });

  it('detects OIDC JWT candidates', () => {
    const token = createJwt({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: 'vercel',
      exp: 1_900_000_000,
    });

    expect(isOidcJwtLike(token)).toBe(true);
    expect(classifyCredential(token)).toBe('oidc-token');
  });

  it('detects OIDC JWT candidates with an audience array', () => {
    const token = createJwt({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: ['vercel', 'other-audience'],
      exp: 1_900_000_000,
    });

    expect(isOidcJwtLike(token)).toBe(true);
    expect(classifyCredential(token)).toBe('oidc-token');
  });

  it('rejects malformed JWT candidates', () => {
    expect(isOidcJwtLike('a.b.c')).toBe(false);
    expect(
      isOidcJwtLike(
        createJwt({
          iss: 'https://token.actions.githubusercontent.com',
          sub: 'repo:vercel/vercel:ref:refs/heads/main',
          aud: 'vercel',
        })
      )
    ).toBe(false);
    expect(
      isOidcJwtLike(
        createJwt({
          iss: 'https://token.actions.githubusercontent.com',
          sub: 'repo:vercel/vercel:ref:refs/heads/main',
          exp: 1_900_000_000,
        })
      )
    ).toBe(false);
  });

  it('classifies invalid tokens', () => {
    expect(classifyCredential('not-a-valid-token')).toBe('invalid');
    expect(classifyCredential('he\nl,o.')).toBe('invalid');
  });
});

function createJwt(payload: Record<string, unknown>) {
  return [
    base64UrlEncode({ alg: 'RS256', typ: 'JWT' }),
    base64UrlEncode(payload),
    'signature',
  ].join('.');
}

function base64UrlEncode(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
