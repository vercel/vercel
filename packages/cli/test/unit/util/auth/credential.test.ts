import { describe, expect, it } from 'vitest';
import {
  getJwtPayload,
  isOidcTokenLike,
} from '../../../../src/util/auth/credential';

describe('OIDC credential detection', () => {
  it('decodes JWT payloads', () => {
    const token = createJwt({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: 'vercel',
      exp: 1_900_000_000,
      iat: 1_800_000_000,
    });

    expect(getJwtPayload(token)).toEqual({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: 'vercel',
      exp: 1_900_000_000,
      iat: 1_800_000_000,
    });
  });

  it('detects OIDC JWT candidates', () => {
    const token = createJwt({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: 'vercel',
      exp: 1_900_000_000,
      iat: 1_800_000_000,
    });

    expect(isOidcTokenLike(token)).toBe(true);
  });

  it('detects OIDC JWT candidates with an audience array', () => {
    const token = createJwt({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:vercel/vercel:ref:refs/heads/main',
      aud: ['vercel', 'other-audience'],
      exp: 1_900_000_000,
      iat: 1_800_000_000,
    });

    expect(isOidcTokenLike(token)).toBe(true);
  });

  it('rejects malformed JWT candidates', () => {
    expect(getJwtPayload('a.b.c')).toBe(null);
    expect(isOidcTokenLike('a.b.c')).toBe(false);
    expect(
      isOidcTokenLike(
        createJwt({
          iss: 'https://token.actions.githubusercontent.com',
          sub: 'repo:vercel/vercel:ref:refs/heads/main',
          aud: 'vercel',
          iat: 1_800_000_000,
        })
      )
    ).toBe(false);
    expect(
      isOidcTokenLike(
        createJwt({
          iss: 'https://token.actions.githubusercontent.com',
          sub: 'repo:vercel/vercel:ref:refs/heads/main',
          exp: 1_900_000_000,
          iat: 1_800_000_000,
        })
      )
    ).toBe(false);
    expect(
      isOidcTokenLike(
        createJwt({
          iss: 'https://token.actions.githubusercontent.com',
          sub: 'repo:vercel/vercel:ref:refs/heads/main',
          aud: 'vercel',
          exp: 1_900_000_000,
        })
      )
    ).toBe(false);
  });

  it('does not classify opaque tokens as OIDC', () => {
    expect(isOidcTokenLike('vcp_abc.def')).toBe(false);
    expect(isOidcTokenLike('abcdefghijklmnopqrstuvwx')).toBe(false);
    expect(isOidcTokenLike('not-a-valid-token')).toBe(false);
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
